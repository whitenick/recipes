/**
 * Regression test: the "Recent Recipes" section must stay.
 *
 * The home page's "Recent Recipes" section depends on three things:
 *   1. The static markup in index.html (featuredSection / featuredGrid).
 *   2. The rendering logic in app.js (loadFeaturedRecipes), which reads
 *      `dateAdded` off each recipe and shows the six most recent.
 *   3. The build output in data/recipes.json actually carrying `dateAdded`.
 *
 * If any of these regress (e.g. the section markup is removed, the JS
 * stops populating it, or the build stops emitting dateAdded), the section
 * silently disappears. These tests fail loudly instead.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('index.html contains the Recent Recipes section markup', () => {
  const html = read('index.html');
  assert.match(html, /id="featuredSection"/, 'featuredSection element must exist');
  assert.match(html, /id="featuredGrid"/, 'featuredGrid element must exist');
  assert.match(html, /id="featuredTitle"/, 'featuredTitle element must exist');
  assert.match(html, /id="featuredSubtitle"/, 'featuredSubtitle element must exist');
});

test('app.js renders the Recent Recipes section', () => {
  const js = read('app.js');
  assert.match(js, /function loadFeaturedRecipes\(\)/, 'loadFeaturedRecipes must exist');
  assert.match(js, /getElementById\('featuredSection'\)/, 'must look up featuredSection');
  assert.match(js, /getElementById\('featuredGrid'\)/, 'must look up featuredGrid');
  assert.match(js, /\.filter\(r => r\.dateAdded\)/, 'must filter recipes that have dateAdded');
  assert.match(js, /\.sort\(\(a, b\) => new Date\(b\.dateAdded\) - new Date\(a\.dateAdded\)\)/, 'must sort newest first');
  assert.match(js, /\.slice\(0, 6\)/, 'must cap at six recent recipes');
  assert.match(js, /section\.style\.display = ''/, 'must reveal the section once populated');
});

test('data/recipes.json carries dateAdded for the Recent Recipes section', () => {
  const recipes = JSON.parse(read('data/recipes.json'));
  assert.ok(Array.isArray(recipes) && recipes.length > 0, 'recipes.json must be a non-empty array');

  const withDate = recipes.filter(r => r && r.dateAdded);
  assert.ok(
    withDate.length > 0,
    'at least one recipe must have a dateAdded (build.js derives it from file mtime)'
  );

  // Every recipe should carry a dateAdded; if the build stops emitting it,
  // the Recent Recipes section silently empties out.
  assert.strictEqual(
    withDate.length,
    recipes.length,
    'every recipe must have a dateAdded so the Recent Recipes section stays populated'
  );

  // Sanity-check the sort used by app.js: all dates must be parseable.
  for (const r of withDate) {
    assert.ok(!Number.isNaN(new Date(r.dateAdded).getTime()), `invalid dateAdded on recipe: ${r.id}`);
  }
});
