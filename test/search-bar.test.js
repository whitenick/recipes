/**
 * Regression test for the AI interactive search bar component (WILS-5).
 *
 * Covers the pieces that are contract, without a browser:
 *   - the dropdown markup ships in index.html alongside the input
 *   - src/main.js wires the component to the search service client
 *   - the pure helpers pin the state machine (including the no-backend
 *     fallback being visible, never silent), prep-time formatting, and the
 *     result-card markup with its HTML-escaping guard
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const sb = require('../src/search-bar.js');
const { pickState, formatPrepTime, resultCardMarkup, statusMarkup } = sb;

// ── Markup contract ────────────────────────────────────

test('index.html hosts the AI search dropdown wiring', () => {
  const html = read('index.html');
  assert.match(html, /id="searchInput"[^>]*aria-controls="searchDropdown"/, 'input must reference the dropdown');
  assert.match(html, /id="searchDropdown"/, 'dropdown container must exist');
  assert.match(html, /id="searchDropdownStatus"/, 'status row must exist');
  assert.match(html, /id="searchResults"/, 'results list must exist');
});

test('src/main.js wires the search-bar component to the service', () => {
  const js = read('src/main.js');
  assert.match(js, /import \{[^}]*createSearchBar[^}]*\} from '\.\/search-bar\.js'/, 'createSearchBar must be imported');
  assert.match(js, /createSearchBar\(\{/, 'component must be instantiated');
  assert.match(js, /search: searchRecipes/, 'service client must be wired in');
  assert.match(js, /lookupRecipe:/, 'recipe lookup must be wired in');
  assert.match(js, /onRanked:/, 'ranked-grid callback must be wired in');
  assert.match(js, /onFallback:/, 'local-filter fallback callback must be wired in');
});

// ── State machine (incl. no-backend fallback) ─────────

test('pickState: loading beats every other state', () => {
  assert.equal(pickState({ inFlight: true, error: true, available: false, hits: [{}] }), 'loading');
});

test('pickState: error beats unavailable; unavailable is the visible fallback', () => {
  assert.equal(pickState({ inFlight: false, error: true, available: false, hits: [] }), 'error');
  assert.equal(pickState({ inFlight: false, error: false, available: false, hits: [] }), 'fallback');
  assert.equal(pickState({ inFlight: false, error: false, available: false, hits: [{}] }), 'fallback');
});

test('pickState: an available service resolves to results or empty', () => {
  assert.equal(pickState({ inFlight: false, error: false, available: true, hits: [{ id: 'a' }] }), 'results');
  assert.equal(pickState({ inFlight: false, error: false, available: true, hits: [] }), 'empty');
});

test('fallback/error states are described in plain words, never silent', () => {
  assert.match(statusMarkup('fallback'), /offline/i);
  assert.match(statusMarkup('error'), /unreachable/i);
  assert.match(statusMarkup('empty'), /no matches/i);
  assert.match(statusMarkup('loading'), /Ranking/i);
});

test('degraded (hybrid→keyword) is surfaced as a subtle note under results', () => {
  assert.match(statusMarkup('results', { degraded: true }), /semantic/i);
  assert.match(statusMarkup('results', { degraded: false }), /Ranked/);
});

// ── Prep time ──────────────────────────────────────────

test('formatPrepTime: numeric minutes first, text fallback, else empty', () => {
  assert.equal(formatPrepTime({ prepTimeMinutes: 15 }, {}), '15 min');
  assert.equal(formatPrepTime({}, { meta: { prepTime: '20 mins' } }), '20 mins');
  assert.equal(formatPrepTime({}, {}), '');
  assert.equal(formatPrepTime({ prepTimeMinutes: 0 }, { meta: { prepTime: '30 mins' } }), '30 mins');
});

// ── Result card markup ─────────────────────────────────

test('resultCardMarkup renders name, categories, prep time, and recipe link', () => {
  const hit = {
    id: 'quick-chicken-dinner',
    title: 'Quick Chicken Dinner',
    categories: ['Chicken', 'Quick & Easy'],
    prepTimeMinutes: 25,
  };
  const card = resultCardMarkup(hit);
  assert.match(card, /class="search-result"/, 'must render a result card');
  assert.match(card, /href="#recipe\/quick-chicken-dinner"/, 'must link into the recipe view');
  assert.match(card, /Quick Chicken Dinner/, 'must render the recipe name');
  assert.match(card, /Quick &amp; Easy/, 'categories must render escaped');
  assert.match(card, /Chicken/, 'dietary/meal-type tags must render');
  assert.match(card, /25 min/, 'prep time must render');
});

test('resultCardMarkup survives a missing local recipe (null lookup)', () => {
  const card = resultCardMarkup({ id: 'solo', title: 'Solo', categories: [], prepTimeMinutes: 10 });
  assert.match(card, /Solo/, 'hit-only data must still render');
  assert.equal(formatPrepTime({}, null), '');
});

test('resultCardMarkup escapes HTML in untrusted fields', () => {
  const hit = {
    id: 'x" onmouseover="alert(1)',
    title: '<b>Bold</b>',
    categories: ['<script>alert(1)</script>'],
  };
  const card = resultCardMarkup(hit);
  assert.ok(!card.includes('<script>'), 'script tag must be escaped');
  assert.ok(!card.includes('<b>Bold</b>'), 'inline HTML must be escaped');
  assert.match(card, /&lt;script&gt;/, 'escaped form must be present');
});