/**
 * Regression test: the "Recent Recipes" default view must keep working.
 *
 * The home page defaults to a Recent Recipes view that depends on three things:
 *   1. The recipe app logic (src/app.js) defaulting to the `__recent__` category.
 *   2. The rendering that sorts recipes by `dateAdded` (newest first).
 *   3. The build output in data/recipes.json actually carrying `dateAdded`.
 *
 * Plus a couple of Vite-migration guards: the home page must load the app from
 * the new module entry, and the recipe corpus must still exist for the build.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('index.html loads the Vite module entry and stylesheet', () => {
  const html = read('index.html');
  assert.match(html, /type="module"\s+src="\/src\/main\.js"/, 'must load main.js as a module');
  assert.match(html, /href="\/src\/style\.css"/, 'must link /src/style.css');
});

test('app logic defaults to Recent Recipes (__recent__) and sorts by dateAdded', () => {
  const js = read('src/app.js');
  assert.match(js, /setCategory\('__recent__'\)/, 'Recent Recipes must be the default');
  assert.match(js, /new Date\(b\.dateAdded\)/, 'must sort by dateAdded');
  assert.match(js, /filteredRecipes\.sort/, 'sorting logic must exist');
});

test('data/recipes.json carries dateAdded for the Recent Recipes view', () => {
  const recipes = JSON.parse(read('data/recipes.json'));
  assert.ok(Array.isArray(recipes) && recipes.length > 0, 'recipes.json must be a non-empty array');

  const withDate = recipes.filter(r => r && r.dateAdded);
  assert.strictEqual(
    withDate.length,
    recipes.length,
    'every recipe must have a dateAdded so the Recent Recipes view stays populated'
  );

  for (const r of withDate) {
    assert.ok(!Number.isNaN(new Date(r.dateAdded).getTime()), `invalid dateAdded on recipe: ${r.id}`);
  }
});
