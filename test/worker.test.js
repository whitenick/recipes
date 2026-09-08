/**
 * Regression test for the Cloudflare Worker search service (WILS-4).
 *
 * Exercises search/worker/src/index.js without a Cloudflare runtime by stubbing
 * global fetch. Covers the two behaviors the service contract pins down:
 *   - CORS is enforced for the exact allowed origin (preflight + simple)
 *   - hybrid (vector) search degrades to keyword-only when the embedder half
 *     fails, and never sends hybrid when embeddings are disabled
 */

const test = require('node:test');
const assert = require('node:assert');

const worker = require('../search/worker/src/index.js');
const { handleRequest, buildSearchPayload, isEmbedderFailure } = worker;

function httpJson(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const ENV = {
  MEILI_URL: 'http://meili.test:7700',
  MEILI_SEARCH_KEY: 'k_search_abc',
  MEILI_INDEX: 'recipes',
  ALLOWED_ORIGINS: 'https://whitenick.github.io,http://localhost:5173',
  EMBEDDER: 'default',
};

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
  const res = await handleRequest(makeRequest('OPTIONS', '/search', { origin: 'https://whitenick.github.io' }), ENV);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://whitenick.github.io');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Content-Type'));
});

test('CORS: preflight from disallowed origin is rejected', async () => {
  const res = await handleRequest(makeRequest('OPTIONS', '/search', { origin: 'https://evil.example' }), ENV);
  assert.equal(res.status, 403);
});

test('hybrid: successful vector+keyword search returns ranked hits, hybrid: true', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    const payload = JSON.parse(init.body);
    assert.ok(payload.hybrid, 'first request must ask for hybrid');
    assert.equal(payload.hybrid.embedder, 'default');
    return httpJson(200, { hits: [{ id: '1', title: 'Quick Chicken Dinner', _rankingScore: 4.2 }], estimatedTotalHits: 1 });
  };
  const res = await handleRequest(makeRequest('POST', '/search', {
    origin: 'http://localhost:5173',
    body: { q: 'quick chicken dinner' },
  }), ENV);
  assert.equal(calls, 1);
  const data = await res.json();
  assert.equal(data.hybrid, true);
  assert.equal(data.degraded, false);
  assert.equal(data.hits[0].title, 'Quick Chicken Dinner');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
});

test('hybrid: embedder failure degrades to keyword-only and flags degraded', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push(Boolean(payload.hybrid));
    if (payload.hybrid) {
      return httpJson(400, { message: "Embedder `default` not found, please check your embedder configuration." });
    }
    return httpJson(200, { hits: [{ id: '2', title: 'Chicken Soup', _rankingScore: 3.1 }], estimatedTotalHits: 1 });
  };
  const res = await handleRequest(makeRequest('POST', '/search', { body: { q: 'chicken' } }), ENV);
  assert.deepEqual(calls, [true, false], 'must retry keyword-only after embedder failure');
  const data = await res.json();
  assert.equal(data.degraded, true, 'degraded flag must be set');
  assert.equal(data.hybrid, false);
  assert.equal(data.hits[0].title, 'Chicken Soup');
});

test('EMBEDDER=off: keyword-only search, never sends hybrid', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push(Boolean(payload.hybrid));
    return httpJson(200, { hits: [{ id: '3', title: 'Beef Stew' }], estimatedTotalHits: 1 });
  };
  const res = await handleRequest(makeRequest('GET', '/search?q=beef'), { ...ENV, EMBEDDER: 'off' });
  assert.deepEqual(calls, [false]);
  const data = await res.json();
  assert.equal(data.hybrid, false);
  assert.equal(data.degraded, false);
});

test('filters: categories + maxMinutes become a Meilisearch filter expression', () => {
  const payload = buildSearchPayload({
    q: 'dinner', categories: ['Chicken', 'Beef'], maxMinutes: 30, limit: 8,
  });
  assert.equal(payload.limit, 8);
  assert.equal(payload.filter, 'categories IN ["Chicken","Beef"] AND meta.totalTimeMinutes <= 30');
  const bare = buildSearchPayload({ q: 'x' });
  assert.ok(!('filter' in bare));
});

test('empty/missing q is a 400 with a clear error', async () => {
  const res = await handleRequest(makeRequest('POST', '/search', { body: { q: '' } }), ENV);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /q/);
});

test('unknown route is 404', async () => {
  const res = await handleRequest(makeRequest('GET', '/nope'), ENV);
  assert.equal(res.status, 404);
});

test('health endpoint reports ok', async () => {
  const res = await handleRequest(makeRequest('GET', '/health'), ENV);
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