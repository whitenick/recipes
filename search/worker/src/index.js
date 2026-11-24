/**
 * recipes-search — Cloudflare Worker search service for recipes.serapiolabs.com.
 *
 * Hybrid search: the keyword half runs against hosted Meilisearch; the
 * semantic (vector) half runs fully serverless on Cloudflare — query
 * embeddings via Workers AI (@cf/baai/bge-small-en-v1.5) and nearest-neighbor
 * lookup via Vectorize index "recipes-semantic" — no self-hosted model, no
 * Meilisearch embedder. The two ranked lists are fused with reciprocal-rank
 * fusion (RRF) and the top-`limit` results are returned.
 *
 *   - the site's fetch() calls only this Worker (never Meilisearch), so the
 *     Meilisearch API key lives in the Worker secrets and never ships to the
 *     browser
 *   - CORS is enforced here for the exact site origin
 *   - if the vector half fails (AI/Vectorize error, missing bindings) the
 *     request degrades to keyword-only and the response carries
 *     `degraded: true`, `hybrid: false` — keyword search keeps working
 *   - a tiny, cheap filter layer (categories / max prep time) so the frontend
 *     can facet without knowing Meilisearch's filter syntax
 *
 * Deploy: `wrangler deploy` with secrets MEILI_URL, MEILI_SEARCH_KEY and the
 * bindings in wrangler.toml ([vectorize] SEMANTIC, [ai] AI, vars MEILI_INDEX,
 * ALLOWED_ORIGINS, EMBEDDER).
 */

const JSON_CT = 'application/json; charset=utf-8';

export const VECTOR_MODEL = '@cf/baai/bge-small-en-v1.5';

export const DEFAULT_ATTRIBUTES = [
  'id',
  'title',
  'description',
  'categories',
  'meta.prepTimeMinutes',
];

/** Match a request Origin against the comma-separated ALLOWED_ORIGINS var. */
function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.includes('*')) return origin;
  return list.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': JSON_CT, ...headers },
  });
}

/**
 * Build the Meilisearch /indexes/:index/search payload from a client request.
 * Keyword-only: the semantic half is handled by this Worker via Vectorize, so
 * no Meilisearch `hybrid` embedder block is ever sent.
 */
export function buildSearchPayload({ q, limit, filter, categories, maxMinutes }) {
  const body = {
    q,
    limit: Number(limit) > 0 ? Number(limit) : 24,
    attributesToRetrieve: DEFAULT_ATTRIBUTES,
    showRankingScore: true,
  };
  const exprs = [];
  if (filter) exprs.push(String(filter));
  if (Array.isArray(categories) && categories.length) {
    const quoted = categories.map((c) => `"${String(c).replaceAll('"', '\\"')}"`).join(',');
    exprs.push(`categories IN [${quoted}]`);
  }
  if (maxMinutes !== undefined && maxMinutes !== null && maxMinutes !== '') {
    exprs.push(`meta.totalTimeMinutes <= ${Number(maxMinutes)}`);
  }
  if (exprs.length) body.filter = exprs.join(' AND ');
  return body;
}

/** True when a Meilisearch failure points at the embedding/vector half. */
export function isEmbedderFailure(res, text) {
  if (res.status === 400 || res.status === 502 || res.status === 503) {
    return /embedder|embedding|semantic|vector|generate.*embed/i.test(text);
  }
  return false;
}

async function callMeili(env, payload) {
  const base = (env.MEILI_URL || 'http://localhost:7700').replace(/\/$/, '');
  const index = env.MEILI_INDEX || 'recipes';
  const res = await fetch(`${base}/indexes/${encodeURIComponent(index)}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(env.MEILI_SEARCH_KEY ? { Authorization: `Bearer ${env.MEILI_SEARCH_KEY}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { res, text };
}

/**
 * Generate the query embedding via Workers AI. bge-small-en-v1.5 returns
 * { data: [[...384 floats]] } for { text: [query] }.
 */
export async function embedQuery(env, text) {
  const res = await env.AI.run(VECTOR_MODEL, { text: [text] });
  const data = res && res.data;
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('AI embedding response had no data');
  }
  return data[0];
}

/**
 * Nearest-neighbor candidates from Vectorize. Client filters (categories /
 * maxMinutes) are applied on the vector metadata in JS — the vector index
 * carries recipe_id/title/categories/time on every vector.
 */
export async function vectorCandidates(env, vector, { limit, categories, maxMinutes }) {
  // Vectorize caps topK at 50 when returnMetadata: 'all' — stay under it.
  const topK = Math.min(Math.max(Number(limit) || 24, 20) * 5, 50);
  const res = await env.SEMANTIC.query(vector, { topK, returnMetadata: 'all' });
  const matches = (res && res.matches) || [];
  const out = [];
  for (const m of matches) {
    const md = m.metadata || {};
    if (categories && categories.length) {
      const cats = new Set((md.categories || []).map(String));
      if (!categories.some((c) => cats.has(String(c)))) continue;
    }
    if (maxMinutes !== undefined && maxMinutes !== null && maxMinutes !== '' && md.totalTimeMinutes != null) {
      if (Number(md.totalTimeMinutes) > Number(maxMinutes)) continue;
    }
    out.push({
      id: md.recipe_id || m.id,
      title: md.title || m.id,
      categories: Array.isArray(md.categories) ? md.categories : [],
      prepTimeMinutes: md.prepTimeMinutes != null ? Number(md.prepTimeMinutes) : null,
      _vecScore: m.score,
    });
  }
  return out;
}

/**
 * Reciprocal-rank fusion: unify the keyword and vector candidate lists into a
 * single ranked list. RRF is calibration-free, so the two score spaces
 * (Meilisearch ranking vs cosine) don't need to agree.
 */
export function fuse(keywordHits, vectorHits, limit) {
  const K = 60;
  const rrf = new Map();
  const add = (hits, weight) => {
    hits.forEach((hit, rank) => {
      const entry = rrf.get(hit.id) || { score: 0, hit: null };
      entry.score += weight / (K + rank + 1);
      if (!entry.hit) entry.hit = hit;
      rrf.set(hit.id, entry);
    });
  };
  add(keywordHits, 1);
  add(vectorHits, 1);
  return [...rrf.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(limit) > 0 ? Number(limit) : 24)
    .map(({ score, hit }) => ({ ...hit, rankingScore: Number(score.toFixed(4)) }));
}

function toClientHits(hits) {
  return hits.map((h) => {
    const prep = h.prepTimeMinutes != null
      ? h.prepTimeMinutes
      : (h.meta && h.meta.prepTimeMinutes != null ? h.meta.prepTimeMinutes : null);
    return {
      id: h.id,
      title: h.title,
      description: h.description || '',
      categories: h.categories || [],
      prepTimeMinutes: prep,
      rankingScore: h.rankingScore,
    };
  });
}

/** Core search routing: parse request → keyword + semantic → RRF merge. */
export async function handleSearch(request, env) {
  let q, limit, filter, categories, maxMinutes, hybridRequested;
  let payloadJson = {};

  if (request.method === 'GET') {
    const u = new URL(request.url);
    q = u.searchParams.get('q') || '';
    limit = u.searchParams.get('limit') || 24;
    filter = u.searchParams.get('filter') || undefined;
    maxMinutes = u.searchParams.get('maxMinutes') || undefined;
    const cats = u.searchParams.get('categories');
    categories = cats ? cats.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    hybridRequested = (u.searchParams.get('hybrid') || 'true') !== 'false';
  } else if (request.method === 'POST') {
    payloadJson = await request.json().catch(() => ({}));
    q = payloadJson.q || '';
    limit = payloadJson.limit || 24;
    filter = payloadJson.filter || undefined;
    categories = Array.isArray(payloadJson.categories) ? payloadJson.categories : undefined;
    maxMinutes = payloadJson.maxMinutes;
    hybridRequested = payloadJson.hybrid !== false;
  } else {
    return json({ error: 'method not allowed' }, 405);
  }

  if (!q || typeof q !== 'string' || !q.trim()) {
    return json({ error: 'missing required field: q' }, 400);
  }

  const embedderConfig = env.EMBEDDER || 'default';
  const embedderEnabled =
    embedderConfig !== 'off' &&
    embedderConfig.toLowerCase() !== 'false' &&
    Boolean(env.AI && env.SEMANTIC);

  // --- Keyword half: Meilisearch keyword search (always). ---
  const keywordPayload = buildSearchPayload({ q, limit, filter, categories, maxMinutes });
  const { res, text } = await callMeili(env, keywordPayload);
  if (!res.ok) {
    return json({ error: 'search upstream failed', status: res.status, detail: text.slice(0, 500) }, 502, {
      'X-Recipes-Retry': 'site-local-filter',
    });
  }

  const meili = JSON.parse(text);
  const keywordHits = (meili.hits || []).map((h) => ({
    id: h.id,
    title: h.title,
    description: h.description || '',
    categories: h.categories || [],
    prepTimeMinutes: h.meta && h.meta.prepTimeMinutes,
    _rankingScore: h._rankingScore,
  }));
  const estimatedTotalHits = meili.estimatedTotalHits || 0;

  // --- Semantic half: Workers AI embedding + Vectorize NN (best-effort). ---
  let degraded = false;
  let hybrid = false;
  let fused = keywordHits;

  if (hybridRequested && embedderEnabled) {
    try {
      const vector = await embedQuery(env, q);
      const vectorHits = await vectorCandidates(env, vector, { limit, categories, maxMinutes });
      fused = fuse(keywordHits, vectorHits, limit);
      hybrid = true; // vector path produced results (possibly empty)
      degraded = false;
    } catch (err) {
      // Embedding/Vectorize unavailable → keyword-only for this request.
      console.error(`vector search failed for q="${q}":`, err && err.message ? err.message : err);
      degraded = true;
      hybrid = false;
      fused = keywordHits;
    }
  }

  return json({
    query: q,
    hits: toClientHits(fused),
    estimatedTotalHits,
    degraded,
    hybrid,
  });
}

/** Main entry: CORS preflight handling + routing. */
export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    const origin = originAllowed(request, env);
    if (!origin) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const origin = originAllowed(request, env);
  const cors = origin ? corsHeaders(origin) : {};

  if (url.pathname === '/health' || url.pathname === '/') {
    return json({ ok: true, service: 'recipes-search', time: new Date().toISOString() }, 200, cors);
  }

  if (url.pathname === '/search') {
    const res = await handleSearch(request, env);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }

  return json({ error: 'not found' }, 404, cors);
}

export default { fetch: (request, env) => handleRequest(request, env) };