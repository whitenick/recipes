#!/usr/bin/env node
/**
 * Relevance smoke test for the recipes search service (WILS-4).
 *
 * Queries the search service (via the Cloudflare Worker handler, so CORS,
 * filters, and hybrid→keyword degradation are all exercised) with
 * natural-language inputs and asserts the top hits are sensible. Works against
 * a local Meilisearch (docker compose) or a remote one — MEILI_URL decides.
 *
 * Usage:
 *   SEARCH_SMOKE_URL=http://localhost:7700 node search/smoke.js
 *   MEILI_URL=http://localhost:7700 MEILI_SEARCH_KEY=<key> node search/smoke.js
 *
 * Exit 0 = all queries returned sensible top hits; non-zero otherwise.
 */

const { handleRequest } = require('./worker/src/index.js');

const MEILI_URL = process.env.MEILI_URL || process.env.SEARCH_SMOKE_URL || 'http://localhost:7700';
const SEARCH_KEY = process.env.MEILI_SEARCH_KEY || process.env.SEARCH_SMOKE_KEY || '';

const ENV = {
  MEILI_URL,
  MEILI_SEARCH_KEY: SEARCH_KEY,
  MEILI_INDEX: 'recipes',
  ALLOWED_ORIGINS: 'https://whitenick.github.io,http://localhost:5173,http://127.0.0.1:5173',
  EMBEDDER: process.env.EMBEDDER || 'default',
};

// (query, keywords that should appear in the top hits' title/description/categories)
const CASES = [
  { q: 'quick chicken dinner', want: ['chicken'] },
  { q: 'kale', want: ['kale'] },
  { q: 'salmon', want: ['salmon'] },
  { q: 'pasta sauce', want: ['sauce', 'pasta', 'tomato'] },
  { q: 'vegetarian soup', want: ['soup'] },
];

// The smoked corpus is the ~385 recipes in data/recipes.json today. Queries and
// expectations are chosen against what the corpus actually contains; swap or
// extend CASES freely. (Note: there is no "chocolate chip cookie" in the corpus
// as of WILS-18, so keyword hits for it are empty by design, not a regression.)

function req(body) {
  return new Request('http://worker.test/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://whitenick.github.io' },
    body: JSON.stringify(body),
  });
}

async function run() {
  let pass = 0;
  let fail = 0;

  for (const c of CASES) {
    const res = await handleRequest(req({ q: c.q, limit: 6 }), ENV);
    if (res.status !== 200) {
      console.log(`✗ "${c.q}" → HTTP ${res.status}`);
      fail += 1;
      continue;
    }
    const data = await res.json();
    const hits = data.hits || [];
    if (hits.length === 0) {
      console.log(`✗ "${c.q}" → 0 hits`);
      fail += 1;
      continue;
    }
    const top = hits.slice(0, 5).map((h) => (h.title + ' ' + (h.description || '')).toLowerCase());
    const topCats = hits.slice(0, 5).flatMap((h) => h.categories || []).join(' ').toLowerCase();
    const blob = (top.join(' ') + ' ' + topCats).replace(/<[^>]+>/g, ' ');
    const matched = c.want.filter((w) => blob.includes(w));
    const corsi = res.headers.get('Access-Control-Allow-Origin');

    if (c.want.length > 0 && matched.length === 0) {
      console.log(`✗ "${c.q}" → top 5 miss ${c.want.join('/')}: ${hits.slice(0, 3).map((h) => h.title).join(' | ')}`);
      fail += 1;
      continue;
    }

    const titles = hits.slice(0, 3).map((h) => h.title).join(' | ');
    console.log(`✓ "${c.q}" (${c.want.join('/')}↑) ${data.degraded ? 'degraded' : 'hybrid'} CORS=${corsi || 'none'} → ${titles}`);
    pass += 1;
  }

  console.log(`\nsmoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error('smoke: fatal', err.message);
  process.exit(1);
});