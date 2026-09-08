#!/usr/bin/env node
/**
 * Nick's Kitchen — Meilisearch indexer.
 *
 * Reads `data/recipes.json` (the normalized corpus) and pushes each recipe to
 * the configured Meilisearch instance as a searchable document. It builds a
 * `searchable_text` blob from the recipe body (markdown-stripped) so ingredient
 * and instruction queries match, and applies the index settings (searchable /
 * filterable / sortable attributes) that the detail + filter UI rely on.
 *
 * The raw `content` field is NOT shipped to the index — only the derived
 * cleaned search text, per docs/search-data-model.md.
 *
 * Usage:
 *   MEILI_URL=http://search.example.com MEILI_MASTER_KEY=... node search/indexer.js
 *   node search/indexer.js --dump search/indexer-seed.json   # no network; emit projection
 *   node search/indexer.js --dry-run                          # count/validate, no changes
 *
 * Env:
 *   MEILI_URL        base URL (default http://localhost:7700)
 *   MEILI_MASTER_KEY required to push (never ship the master key to clients)
 *   MEILI_INDEX      index name (default "recipes")
 *   MEILI_HYBRID     by default the indexer configures no embedder here —
 *                    embedding is configured at the Meilisearch instance level
 *                    (see docs/search-deployment.md).
 */

const fs = require('node:fs');
const path = require('node:path');

const DATA_ARG = process.argv.indexOf('--data');
const DATA_FILE = DATA_ARG !== -1 ? process.argv[DATA_ARG + 1] : 'data/recipes.json';
const DUMP_ARG_IDX = process.argv.indexOf('--dump');
const DUMP_ARG = DUMP_ARG_IDX !== -1 ? process.argv[DUMP_ARG_IDX + 1] : undefined;
const DRY_RUN = process.argv.includes('--dry-run');

const BASE_URL = process.env.MEILI_URL || 'http://localhost:7700';
const MASTER_KEY = process.env.MEILI_MASTER_KEY || '';
const INDEX = process.env.MEILI_INDEX || 'recipes';

const WORDS_TO_DROP = new Set([
  'cook mode', 'jump to recipe', 'prep time', 'cook time', 'total time', 'servings',
  'yield', 'serves', 'ingredients', 'instructions', 'method', 'directions', 'print',
  'recipe', 'source', 'email', 'subscribe', 'newsletter', 'share', 'facebook', 'pinterest',
]);

function cleanSearchableText(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/[*_~`>|#\-]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildSearchableText(recipe) {
  const parts = [recipe.title, recipe.description];
  if (recipe.categories) parts.push(...recipe.categories);
  if (recipe.ingredients) parts.push(...recipe.ingredients);
  parts.push(recipe.content || ''); // body → ingredient/instruction matching
  const cleaned = cleanSearchableText(parts.join('\n'));
  const words = cleaned.split(' ').filter(word => word.length > 1 && !WORDS_TO_DROP.has(word));
  return words.join(' ');
}

/**
 * Project a corpus record into the index document. Excludes raw `content`,
 * `filename`, and `subdir`; ships numeric `meta` facets for filter UI.
 */
function project(recipe) {
  const meta = recipe.meta || {};
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description || '',
    categories: Array.isArray(recipe.categories) ? recipe.categories : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    searchable_text: buildSearchableText(recipe),
    meta: {
      prepTimeMinutes: meta.prepTimeMinutes,
      cookTimeMinutes: meta.cookTimeMinutes,
      totalTimeMinutes: meta.totalTimeMinutes,
      servingsMin: meta.servingsMin,
      servingsMax: meta.servingsMax,
    },
    dateAdded: recipe.dateAdded || '',
  };
}

const SETTINGS = {
  searchableAttributes: ['title', 'description', 'ingredients', 'categories', 'searchable_text'],
  filterableAttributes: [
    'categories',
    'meta.prepTimeMinutes',
    'meta.cookTimeMinutes',
    'meta.totalTimeMinutes',
    'meta.servingsMin',
    'meta.servingsMax',
  ],
  sortableAttributes: ['dateAdded'],
  rankingScoreThreshold: 0.0,
  pagination: { maxTotalHits: 10000 },
};

async function api(method, segment, body) {
  const res = await fetch(`${BASE_URL}/${segment}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${MASTER_KEY}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Meilisearch ${method} ${segment} → ${res.status}: ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

async function createIndex() {
  try {
    await api('GET', `indexes/${encodeURIComponent(INDEX)}`);
  } catch (err) {
    // 404 → create it with the primary key pinned to `id`.
    await api('POST', 'indexes', { uid: INDEX, primaryKey: 'id' });
  }
}

async function push(records) {
  await createIndex();
  await api('PATCH', `indexes/${encodeURIComponent(INDEX)}/settings`, SETTINGS);
  const total = records.length;
  const BATCH = 1000;
  for (let i = 0; i < total; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { taskUid } = await api('POST', `indexes/${encodeURIComponent(INDEX)}/documents`, batch);
    console.log(`queued addOrReplace task ${taskUid}: records ${i + 1}-${Math.min(i + BATCH, total)}`);
  }
  return total;
}

async function main() {
  const records = JSON.parse(fs.readFileSync(path.resolve(DATA_FILE), 'utf8'));
  if (!Array.isArray(records)) throw new Error(`${DATA_FILE} must be a JSON array`);
  const docs = records.map(project);

  console.log(`indexer: read ${records.length} recipes from ${DATA_FILE}`);

  const missingId = docs.filter(d => !d.id);
  if (missingId.length) throw new Error(`${missingId.length} records missing an id`);
  const dupes = docs.length - new Set(docs.map(d => d.id)).size;
  if (dupes) console.log(`indexer: warning — ${dupes} duplicate document id(s) (existing corpus caveat)`);

  if (DUMP_ARG) {
    fs.writeFileSync(path.resolve(DUMP_ARG), JSON.stringify(docs, null, 2));
    console.log(`indexer: dumped ${docs.length} documents to ${DUMP_ARG} (no network)`);
    return;
  }

  if (DRY_RUN) {
    console.log(`indexer: dry-run — would push ${docs.length} documents to ${BASE_URL}/${INDEX}`);
    return;
  }

  if (!MASTER_KEY) throw new Error('MEILI_MASTER_KEY is required to push (use --dump or --dry-run without it)');

  const pushed = await push(docs);
  console.log(`indexer: pushed ${pushed} documents to ${BASE_URL}/${INDEX}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`indexer: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { project, buildSearchableText, cleanSearchableText, SETTINGS };