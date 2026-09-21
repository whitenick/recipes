/**
 * recipes-search — Cloudflare Worker in front of Meilisearch (WILS-4).
 *
 * Cloudflare has no product that runs Meilisearch itself (it is a standalone
 * Rust search engine with its own storage and process model), so the search
 * service is a thin Worker in front of a hosted Meilisearch instance
 * (Meilisearch Cloud, or a self-hosted one the Worker can reach). The Worker
 * is the entire browser-facing surface of the search service:
 *
 *   - the site's fetch() calls only this Worker (never Meilisearch), so the
 *     Meilisearch API key lives in the Worker secrets and never ships to the
 *     browser (fixes the WILS-17 client-baked key)
 *   - CORS is enforced here for the exact site origin
 *   - hybrid (keyword + vector) search is attempted when an embedder is
 *     configured; if the embedding half fails or is disabled, the request
 *     degrades to keyword-only and the response carries `degraded: true`
 *   - a tiny, cheap filter layer (categories / max prep time) so the frontend
 *     can facet without knowing Meilisearch's filter syntax
 *
 * Deploy: `wrangler deploy` with the secrets in docs/search-deployment.md (vars:
 * MEILI_URL, MEILI_SEARCH_KEY, MEILI_INDEX, ALLOWED_ORIGINS, EMBEDDER).
 */

const JSON_CT = 'application/json; charset=utf-8';

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
 * `hybrid` is true only when an embedder should be tried.
 */
export function buildSearchPayload({ q, limit, filter, categories, maxMinutes, hybrid, embedder }) {
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
  if (hybrid) body.hybrid = { embedder: embedder || 'default', semanticRatio: 0.5 };
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

/** Core search routing: parse request → call Meilisearch (hybrid→keyword fallback). */
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
  const embedderEnabled = embedderConfig !== 'off' && embedderConfig.toLowerCase() !== 'false';
  const wantHybrid = hybridRequested && embedderEnabled;

  const attempt = (hybrid) => callMeili(
    env,
    buildSearchPayload({ q, limit, filter, categories, maxMinutes, hybrid, embedder: env.EMBEDDER }),
  );

  let { res, text } = await attempt(wantHybrid);

  let degraded = false;
  if (wantHybrid) {
    if (isEmbedderFailure(res, text)) {
      // Embedding unavailable → degrade to keyword-only for this request.
      const kw = await attempt(false);
      if (kw.res.ok) {
        degraded = true;
        res = kw.res;
        text = kw.text;
      }
      // on keyword fallback failure we surface the keyword error below
    }
  }

  if (!res.ok) {
    return json({ error: 'search upstream failed', status: res.status, detail: text.slice(0, 500) }, 502, {
      'X-Recipes-Retry': 'site-local-filter',
    });
  }

  const data = JSON.parse(text);
  const hits = (data.hits || []).map((h) => ({
    id: h.id,
    title: h.title,
    description: h.description || '',
    categories: h.categories || [],
    prepTimeMinutes: h.meta && h.meta.prepTimeMinutes,
    rankingScore: h._rankingScore,
  }));
  return json({
    query: q,
    hits,
    estimatedTotalHits: data.estimatedTotalHits || 0,
    degraded,
    hybrid: wantHybrid && !degraded,
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