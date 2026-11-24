#!/usr/bin/env node
/**
 * Nick's Kitchen — Vectorize semantic indexer.
 *
 * Embeds every recipe in `data/recipes.json` with Workers AI
 * (@cf/baai/bge-small-en-v1.5, 384-dim, free tier) and upserts the vectors
 * into the Cloudflare Vectorize index `recipes-semantic`.
 *
 * The embedding text is the same `searchable_text` blob the Meilisearch
 * indexer builds (title + description + categories + ingredients + body),
 * truncated for the bge context window. Idempotent: upsert by recipe id, so
 * re-running after a corpus rebuild refreshes vectors in place.
 *
 * Usage:
 *   node search/vectorize-indexer.js [--data data/recipes.json]
 *   node search/vectorize-indexer.js --dry-run
 *
 * Env:
 *   CLOUDFLARE_ACCOUNT_ID   account id (default reads ~/.wrangler config or
 *                           uses CLOUDFLARE_ACCOUNT_ID env)
 *   CLOUDFLARE_API_TOKEN    Bearer token (default: wrangler OAuth token from
 *                           ~/.wrangler/config/default.toml)
 *   VECTORIZE_INDEX         index name (default "recipes-semantic")
 *   EMBED_MODEL             Workers AI model (default "@cf/baai/bge-small-en-v1.5")
 *   EMBED_BATCH             texts per AI run call (default 64)
 *   UPSERT_BATCH            vectors per upsert call (default 100)
 *
 * NEVER prints the token. Output is counts + ids only.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { buildSearchableText } = require('./indexer.js');

const DATA_ARG = process.argv.indexOf('--data');
const DATA_FILE = DATA_ARG !== -1 ? process.argv[DATA_ARG + 1] : path.resolve(__dirname, '../data/recipes.json');
const DRY_RUN = process.argv.includes('--dry-run');

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ||
  'b22fbe770b8a2975d3554772b94f6975';
const INDEX = process.env.VECTORIZE_INDEX || 'recipes-semantic';
const MODEL = process.env.EMBED_MODEL || '@cf/baai/bge-small-en-v1.5';
const EMBED_BATCH = Number(process.env.EMBED_BATCH || 64);
const UPSERT_BATCH = Number(process.env.UPSERT_BATCH || 100);
const MAX_TEXT_CHARS = 3000; // bge-small context ≈ 512 tokens

function getToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const cfg = path.join(os.homedir(), '.wrangler/config/default.toml');
  if (fs.existsSync(cfg)) {
    const m = fs.readFileSync(cfg, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error('No token — set CLOUDFLARE_API_TOKEN or run wrangler login first');
}

const TOKEN = DRY_RUN ? '' : getToken();
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

// NOTE: the REST /vectorize/v2/.../upsert endpoint silently swallows per-vector
// validation errors for multi-vector NDJSON bodies (returns success + a
// mutationId even when vectors are dropped). The wrangler CLI path surfaces
// errors and enqueues reliably, so bulk upserts go through wrangler, while
// the REST endpoint is used for embed generation only.

async function cf(method, url, body, headers = {}) {
  const abs = url.startsWith('https://') ? url : `https://api.cloudflare.com/client/v4${url}`;
  const res = await fetch(abs, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...headers,
    },
    body,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json.errors || json).slice(0, 300)}`);
  }
  return json;
}

async function embed(texts) {
  const res = await cf('POST', `${API}/ai/run/${MODEL}`, JSON.stringify({ text: texts }), {
    'Content-Type': 'application/json',
  });
  return res.result.data; // array of 384-dim arrays
}

/** Retry helper with backoff for transient AI/API hiccups. */
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function upsertVectors(vectors) {
  const tmp = path.join(os.tmpdir(), `vz-recipes-${process.pid}.ndjson`);
  fs.writeFileSync(tmp, vectors.map(v => JSON.stringify(v)).join('\n') + '\n');
  try {
    execFileSync('wrangler', ['vectorize', 'upsert', INDEX, '--file', tmp, '--json'], {
      stdio: 'pipe',
      env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN },
    });
  } finally {
    fs.unlinkSync(tmp);
  }
}

function embedText(recipe) {
  const text = buildSearchableText(recipe);
  // Truncate to the bge context window; keep head (title/description first).
  return text.slice(0, MAX_TEXT_CHARS);
}

/** Vectorize ids are capped at 64 bytes — hash long recipe ids, keep the
 *  original in metadata so the worker can map matches back to recipes. */
function vectorId(recipeId) {
  if (Buffer.byteLength(recipeId, 'utf8') <= 64) return recipeId;
  return crypto.createHash('sha256').update(recipeId).digest('hex').slice(0, 48);
}

async function main() {
  const recipes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(recipes)) throw new Error(`${DATA_FILE} must be a JSON array`);
  console.log(`vectorize-indexer: read ${recipes.length} recipes from ${DATA_FILE}`);
  console.log(`vectorize-indexer: model=${MODEL} index=${INDEX} account=${ACCOUNT_ID.slice(0, 6)}…`);

  const missingId = recipes.filter(r => !r.id);
  if (missingId.length) throw new Error(`${missingId.length} recipes missing an id`);

  if (DRY_RUN) {
    const sample = embedText(recipes[0]);
    console.log(`vectorize-indexer: dry-run — would embed ${recipes.length} recipes (sample text ${sample.length} chars)`);
    return;
  }

  const vectors = [];
  for (let i = 0; i < recipes.length; i += EMBED_BATCH) {
    const batch = recipes.slice(i, i + EMBED_BATCH);
    const texts = batch.map(embedText);
    const data = await withRetry(() => embed(texts));
    if (data.length !== batch.length) throw new Error(`embed count mismatch: ${data.length} vs ${batch.length}`);
    batch.forEach((r, j) => {
      const meta = r.meta || {};
      vectors.push({
        id: vectorId(r.id),
        values: data[j],
        metadata: {
          recipe_id: r.id,
          title: r.title,
          categories: Array.isArray(r.categories) ? r.categories : [],
          prepTimeMinutes: meta.prepTimeMinutes ?? null,
          totalTimeMinutes: meta.totalTimeMinutes ?? null,
          source: 'recipes',
        },
      });
    });
    console.log(`vectorize-indexer: embedded ${Math.min(i + EMBED_BATCH, recipes.length)}/${recipes.length}`);
  }

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
    const batch = vectors.slice(i, i + UPSERT_BATCH);
    await upsertVectors(batch);
    console.log(`vectorize-indexer: upserted ${Math.min(i + UPSERT_BATCH, vectors.length)}/${vectors.length}`);
  }

  console.log(`vectorize-indexer: done — ${vectors.length} vectors in ${INDEX}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`vectorize-indexer: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { embedText };