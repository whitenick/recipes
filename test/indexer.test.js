/**
 * Regression test for the Meilisearch indexer (WILS-17).
 *
 * Exercises search/indexer.js's projection + settings directly and asserts the
 * index contract from docs/search-data-model.md:
 *   - every record keeps its `id` (Meilisearch primary key)
 *   - a searchable_text blob exists for body/ingredient/instruction matching
 *   - the raw `content`/filename/subdir fields are NOT shipped to the index
 *   - filterable/sortable attributes (numeric facets, dateAdded) are declared
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const indexer = require('../search/indexer.js');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..');
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/recipes.json'), 'utf8'));

test('indexer settings declare searchable/filterable/sortable contract', () => {
  assert.ok(indexer.SETTINGS.searchableAttributes.includes('searchable_text'),
    'searchable_text must be a searchable attribute');
  assert.ok(indexer.SETTINGS.filterableAttributes.includes('categories'),
    'categories must be filterable');
  for (const facet of ['meta.prepTimeMinutes', 'meta.cookTimeMinutes',
    'meta.totalTimeMinutes', 'meta.servingsMin', 'meta.servingsMax']) {
    assert.ok(indexer.SETTINGS.filterableAttributes.includes(facet),
      `${facet} must be filterable`);
  }
  assert.ok(indexer.SETTINGS.sortableAttributes.includes('dateAdded'),
    'dateAdded must be sortable');
  assert.ok(indexer.SETTINGS.searchableAttributes.includes('ingredients'),
    'ingredients must be searchable');
});

test('indexer projection: id + searchable_text present; content/filename excluded', () => {
  assert.ok(Array.isArray(corpus) && corpus.length > 0, 'corpus must be non-empty');
  for (const recipe of corpus) {
    const doc = indexer.project(recipe);
    assert.ok(doc.id, 'document must carry its id (Meilisearch primary key)');
    assert.ok(typeof doc.searchable_text === 'string' && doc.searchable_text.length > 0,
      `searchable_text must be a non-empty blob on ${doc.id}`);
    assert.ok(!('content' in doc), 'raw content must not ship to the index');
    assert.ok(!('filename' in doc), 'filename must not ship to the index');
    assert.ok(!('subdir' in doc), 'subdir must not ship to the index');
    assert.ok('categories' in doc && 'ingredients' in doc, 'searchable fields must be present');
    assert.ok('dateAdded' in doc, 'sortable dateAdded must be present');
    assert.ok(doc.meta && 'meta' in doc, 'numeric meta facets bucket must be present');
  }
});

test('searchable_text incorporates body text for instruction/ingredient queries', () => {
  // Pick a recipe with a real body and confirm its words surface in the blob.
  const withBody = corpus.find(r => (r.content || '').split(/\s+/).length > 60);
  assert.ok(withBody, 'expected at least one corpus entry with a body');
  const doc = indexer.project(withBody);
  const blobWords = new Set(doc.searchable_text.split(' '));
  const contentWords = withBody.content.toLowerCase().match(/[a-z]{4,}/g) || [];
  const dietangle = contentWords.some(w => blobWords.has(w));
  assert.ok(dietangle, `searchable_text should echo body words (recipe ${withBody.id})`);
  assert.ok(!/```/.test(doc.searchable_text), 'markdown code fences must be stripped');
});