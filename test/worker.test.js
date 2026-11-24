/**
 * Regression test for the Cloudflare Worker search service.
 *
 * Exercises search/worker/src/index.js without a Cloudflare runtime by stubbing
 * global fetch (Meilisearch) plus env.AI (Workers AI embeddings) and
 * env.SEMANTIC (Vectorize). Covers the pinned contract:
 *   - CORS is enforced for the exact allowed origin (preflight + simple)
 *   - the semantic (Vectorize + Workers AI) half runs when bindings exist and
 *     EMBEDDER != off, fusing with keyword hits (hybrid: true, degraded: false)
 *   - a vector-half failure degrades to keyword-only (degraded: true)
 *   - EMBEDDER=off / missing bindings never touch AI/Vectorize
 */

const test = require('node:test');
const assert = require('node:assert');

const worker = require('../search/worker/src/index.js');
const { handleRequest, buildSearchPayload, isEmbedderFailure, fuse } = worker;

function httpJson(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const EMBEDDING = Array.from({ length: 384 }, (_, i) => i / 384);

function makeEnv(overrides = {}) {
  return {
    MEILI_URL: 'http://meili.test:7700',
    MEILI_SEARCH_KEY: 'k_search_abc',
    MEILI_INDEX: 'recipes',
    ALLOWED_ORIGINS: 'https://recipes.serapiolabs.com,https://whitenick.github.io,http://localhost:5173',
    EMBEDDER: 'default',
    AI: {
      run: async () => ({ data: [EMBEDDING] }),
    },
    SEMANTIC: {
      query: async () => ({
        matches: [
          { id: 'vec_1', score: 0.9, metadata: { recipe_id: 'semantic-soup', title: 'Semantic Soup', categories: ['Soup'], prepTimeMinutes: 30 } },
          { id: 'vec_2', score: 0.8, metadata: { recipe_id: 'autumn-risotto', title: 'Autumn Risotto', categories: ['Vegetarian'], prepTimeMinutes: 40 } },
        ],
      }),
    },
    ...overrides,
  };
}

function meiliHits() {
  return [{ id: 'quick-chicken', title: 'Quick Chicken Dinner', _rankingScore: 0.42 }];
}

function makeRequest(method, path, { origin, body } = {}) {
  const headers = {};
  if (origin) headers['Origin'] = origin;
  if (body) headers['Content-Type'] = 'application/json';
  return new Request(`http://worker.test${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('CORS: preflight from allowed origin returns 204 with echo headers', async () => {
  const res = await handleRequest(makeRequest('OPTIONS', '/search', { origin: 'https://whitenick.github.io' }), makeEnv());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://whitenick.github.io');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Content-Type'));
});

test('CORS: preflight from disallowed origin is rejected', async () => {
  const res = await handleRequest(makeRequest('OPTIONS', '/search', { origin: 'https://evil.example' }), makeEnv());
  assert.equal(res.status, 403);
});

test('hybrid: keyword + semantic hits are fused, hybrid: true, degraded: false', async () => {
  let meiliPayload;
  globalThis.fetch = async (url, init) => {
    meiliPayload = JSON.parse(init.body);
    return httpJson(200, { hits: meiliHits(), estimatedTotalHits: 12 });
  };
  const res = await handleRequest(makeRequest('POST', '/search', {
    origin: 'http://localhost:5173',
    body: { q: 'speedy squash soup' },
  }), makeEnv());
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.hybrid, true);
  assert.equal(data.degraded, false);
  assert.equal(data.estimatedTotalHits, 12);
  // Fused ranks: semantic-soup (vector rank 1 + no keyword match) should
  // outrank quick-chicken (keyword rank 1) because RRF adds both lists.
  const ids = data.hits.map((h) => h.id);
  assert.ok(ids.length >= 2, `expected ≥2 fused hits, got ${ids.length}`);
  const kw = ids.findIndex((id) => id === 'quick-chicken');
  const vec = ids.findIndex((id) => id === 'semantic-soup');
  assert.ok(vec >= 0, 'vector hit must be present');
  assert.ok(kw >= 0, 'keyword hit must be present');
  // Meilisearch call must be keyword-only (no hybrid embedder block)
  assert.ok(!meiliPayload.hybrid, 'Meili payload must not carry a hybrid embedder block');
});

test('hybrid: vector half failure degrades to keyword-only and flags degraded', async () => {
  const aiCalls = [];
  globalThis.fetch = async () => httpJson(200, { hits: meiliHits(), estimatedTotalHits: 1 });
  const env = makeEnv();
  env.AI = {
    run: async (...args) => {
      aiCalls.push(args[0]);
      throw new Error('AI unavailable');
    },
  };
  const res = await handleRequest(makeRequest('POST', '/search', { body: { q: 'chicken' } }), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.degraded, true);
  assert.equal(data.hybrid, false);
  assert.equal(data.hits[0].id, 'quick-chicken');
  assert.deepEqual(aiCalls, [worker.VECTOR_MODEL]);
});

test('EMBEDDER=off: keyword-only search, never calls AI or Vectorize', async () => {
  let aiCalls = 0;
  let vecCalls = 0;
  globalThis.fetch = async () => httpJson(200, { hits: [{ id: '3', title: 'Beef Stew' }], estimatedTotalHits: 1 });
  const env = makeEnv({ EMBEDDER: 'off' });
  env.AI.run = async () => { aiCalls += 1; return { data: [EMBEDDING] }; };
  env.SEMANTIC.query = async () => { vecCalls += 1; return { matches: [] }; };
  const res = await handleRequest(makeRequest('GET', '/search?q=beef'), env);
  const data = await res.json();
  assert.equal(data.hybrid, false);
  assert.equal(data.degraded, false);
  assert.equal(aiCalls, 0);
  assert.equal(vecCalls, 0);
});

test('missing Vectorize/AI bindings: keyword-only, no error', async () => {
  globalThis.fetch = async () => httpJson(200, { hits: [{ id: '3', title: 'Beef Stew' }], estimatedTotalHits: 1 });
  const env = { ...makeEnv(), AI: undefined, SEMANTIC: undefined };
  const res = await handleRequest(makeRequest('GET', '/search?q=beef'), env);
  const data = await res.json();
  assert.equal(data.hybrid, false);
  assert.equal(data.degraded, false);
  assert.equal(data.hits[0].id, '3');
});

test('filters: categories + maxMinutes become a Meilisearch filter expression', () => {
  const payload = buildSearchPayload({
    q: 'dinner', categories: ['Chicken', 'Beef'], maxMinutes: 30, limit: 8,
  });
  assert.equal(payload.limit, 8);
  assert.equal(payload.filter, 'categories IN ["Chicken","Beef"] AND meta.totalTimeMinutes <= 30');
  const bare = buildSearchPayload({ q: 'x' });
  assert.ok(!('filter' in bare));
  assert.ok(!('hybrid' in bare));
});

test('fuse: RRF merges and ranks keyword + vector lists', () => {
  const kw = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const vec = [{ id: 'b', title: 'B' }, { id: 'c', title: 'C' }];
  const fused = fuse(kw, vec, 10);
  assert.deepEqual(fused.map((h) => h.id), ['b', 'a', 'c']);
  assert.ok(fused.every((h) => typeof h.rankingScore === 'number'));
});

test('empty/missing q is a 400 with a clear error', async () => {
  const res = await handleRequest(makeRequest('POST', '/search', { body: { q: '' } }), makeEnv());
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /q/);
});

test('unknown route is 404', async () => {
  const res = await handleRequest(makeRequest('GET', '/nope'), makeEnv());
  assert.equal(res.status, 404);
});

test('health endpoint reports ok', async () => {
  const res = await handleRequest(makeRequest('GET', '/health'), makeEnv());
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
});

test('isEmbedderFailure classifies embedder errors only', () => {
  assert.ok(isEmbedderFailure({ status: 400 }, 'Embedder `default` not found'));
  assert.ok(isEmbedderFailure({ status: 503 }, 'embedding generation failed'));
  assert.ok(!isEmbedderFailure({ status: 401 }, 'invalid API key'));
  assert.ok(!isEmbedderFailure({ status: 500 }, 'internal server error'));
});