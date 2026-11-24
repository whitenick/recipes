# AI Search — Cloudflare Worker: Meilisearch (keyword) + Vectorize (semantic)

The site's search bar is **live, ranked, hybrid (keyword + vector)
search-as-you-type** served by a **Cloudflare Worker**. The keyword half runs
against hosted Meilisearch; the semantic half runs fully serverless on
Cloudflare — **Workers AI** embeddings (`@cf/baai/bge-small-en-v1.5`, 384-dim)
with **Vectorize** (`recipes-semantic`) nearest-neighbor lookup, **no
self-hosted model**. The two ranked lists are merged with reciprocal-rank
fusion (RRF) in the Worker.

The recipes site itself stays a static build on **Cloudflare Pages** (the GitHub
Pages redirect stub is deprecated — see `docs/backend-decision.md` §4).

> ⚠️ Additive and **opt-in**: if no search endpoint is configured at build
> time, the site keeps working exactly as before with the local substring
> filter. The backend is a search *improvement*, never a hard dependency.

---

## Architecture at a glance

```
Cloudflare                        Hosted Meilisearch (Meilisearch Cloud / self-hosted)
┌────────────────────────┐        ┌─────────────────────────────┐
│ GitHub/CF Pages site   │        │ index "recipes"             │
│  src/main.js           │        │  └─ documents (392 recipes) │
│    └─ src/search.js ───┼───────▶│  keyword search only        │
│       POST /search     │  Auth  └─────────────────────────────┘
│  (worker URL, no key)  │   ▶
└───────────┬────────────┘        Cloudflare (serverless)
            │     ▲ CORS on the   ┌─────────────────────────────┐
            ▼     │ Worker        │ Vectorize "recipes-semantic"│
   search/worker/index.js         │  └─ 392 vectors, bge-small  │
      ├─ Meilisearch (keyword) ──▶│    (384-dim, cosine, with   │
      └─ AI embed + Vectorize ───▶│     recipe_id/title/cats/   │
                                    │     time metadata)         │
                                    │ Workers AI @cf/baai/       │
                                    │  bge-small-en-v1.5 (query) │
                                    └─────────────────────────────┘
```

- Browser → Worker only. The Worker calls Meilisearch **and** Vectorize, fuses
  the ranked lists (RRF), and never exposes either key to the browser.
- The Worker is the entire browser-facing surface: CORS, keys, hybrid→keyword
  fallback, and the cheap filter layer all live there.

---

## 1. Search service — `search/worker` (Cloudflare Worker)

`search/worker/src/index.js` is a single-file Worker (~150 lines) that fronts
Meilisearch. It exposes:

| Endpoint | Behavior |
|---|---|
| `GET /health` | `{ "ok": true }` — cheap liveness check |
| `POST /search` | JSON `{ q, limit?, categories?, maxMinutes?, hybrid? }` → ranked hits |
| `GET /search?q=…&categories=A,B` | same, query-param form |
| `OPTIONS *` | CORS preflight for the allowed site origin |

Response shape:

```json
{
  "query": "quick chicken dinner",
  "hits": [
    { "id": "…", "title": "…", "description": "…",
      "categories": ["Chicken"], "prepTimeMinutes": 20,
      "rankingScore": 4.2 }
  ],
  "estimatedTotalHits": 12,
  "degraded": false,
  "hybrid": true
}
```

- **CORS:** only `ALLOWED_ORIGINS` (Worker var: the Pages/site origin plus
  `localhost:5173` for dev) may call the Worker. Preflight and response
  echo the matched origin.
- **Key handling:** `MEILI_SEARCH_KEY` is a Worker **secret** (`wrangler
  secret put MEILI_SEARCH_KEY`). It never reaches the client — fixing the
  WILS-17 design that baked a search-only key into the static build.
- **Hybrid→keyword fallback (the failure mode):** the Worker sends
  `hybrid: { embedder, semanticRatio }` when `EMBEDDER != off`. If Meilisearch
  responds with an embedding error (missing/unconfigured embedder, embedder
  down), the Worker automatically retries the same query keyword-only and sets
  `degraded: true` on the response — the frontend keeps working. Set
  `EMBEDDER=off` to force keyword-only always.

### Deploy

```bash
cd search/worker
npm i            # or: npx wrangler@latest
npx wrangler login
npx wrangler deploy
npx wrangler secret put MEILI_URL          # https://<instance>.meilisearch.com
npx wrangler secret put MEILI_SEARCH_KEY   # Meilisearch search-only key
npx wrangler secret put MEILI_INDEX        # recipes (or set in [vars])
# Allowed origins + embedder mode are public vars in wrangler.toml [vars].
```

Local dev against a local Meilisearch:

```bash
docker compose -f search/docker-compose.yml up -d   # local Meilisearch
MEILI_URL=http://localhost:7700 MEILI_SEARCH_KEY=<search key> npx wrangler dev
# → http://127.0.0.1:8787/search?q=chicken (CORS origin localhost:5173 allowed)
```

---

## 2. Indexing (initial + incremental)

`search/indexer.js` reads `data/recipes.json` and pushes each recipe as a
Meilisearch document. It builds a `searchable_text` blob from the title,
description, categories, ingredients, **and** the markdown-stripped body, so
ingredient and instruction queries ("kale", "simmer 20 minutes") match. The
raw `content` field is **not** shipped — only the derived search text, per
`docs/search-data-model.md`.

Reindex is one command (idempotent add-or-replace by `id`):

```bash
MEILI_URL="https://<instance>.meilisearch.com" \
MEILI_MASTER_KEY="<master key>" \
node search/indexer.js
```

Offline / CI-safe modes (no network, no key required):

```bash
node search/indexer.js --dry-run              # validate + count
node search/indexer.js --dump seed.json       # emit the projected seed for review
# or: npm run index:search / npm run index:search:dry
```

The indexer pins the **primary key to `id`**, `searchableAttributes` (title,
description, ingredients, categories, searchable_text), `filterableAttributes`
(categories + `meta.*Minutes` numeric facets), and `sortableAttributes`
(`dateAdded`) — the field contract in `docs/search-data-model.md`. First-run
index creation is automatic; re-runs update documents and settings in place.

**Incremental sync:** reindexing is full-file idempotent, so the normal corpus
flow (rebuild `data/recipes.json`, re-run the indexer) is both the initial
seed and the incremental path. Script it as one step, e.g.:

```bash
bash update.sh                                                        # regenerates data/recipes.json + deploys site
MEILI_URL=... MEILI_MASTER_KEY=... node search/indexer.js             # refresh the search index
```

---

## 3. Semantic half — Vectorize + Workers AI embeddings (serverless)

The vector half is 100% Cloudflare serverless (free tier): the Worker embeds
each query with Workers AI and does nearest-neighbor lookup in Vectorize. No
self-hosted model, no Meilisearch embedder.

**Setup (one-time):**

```bash
# 1. Create the Vectorize index (preset sets 384 dims + cosine metric):
cd search/worker
npx wrangler vectorize create recipes-semantic --preset "@cf/baai/bge-small-en-v1.5"

# 2. Bindings in search/worker/wrangler.toml:
#    [[vectorize]] binding = "SEMANTIC" index_name = "recipes-semantic"
#    [ai] binding = "AI"   (wrangler 4.x object syntax)

# 3. Embed the corpus + upsert (idempotent; run after any corpus rebuild):
cd ../..
node search/vectorize-indexer.js        # ~392 vectors, bge-small-en-v1.5
```

The indexer embeds the same `searchable_text` blob the Meilisearch indexer
builds (title, description, categories, ingredients, body) and stores
`recipe_id`, `title`, `categories`, `prepTimeMinutes`, `totalTimeMinutes` as
vector metadata so the Worker can filter and map matches back to recipes
(Vectorize ids are capped at 64 bytes; long recipe ids are hashed, with the
original kept in metadata).

**Query path (in the Worker):** `env.AI.run('@cf/baai/bge-small-en-v1.5',
{ text: [q] })` → `env.SEMANTIC.query(vector, { topK, returnMetadata: 'all' })`
→ candidates fused with the Meilisearch keyword hits via RRF.

- **Free tier:** bge-small-en-v1.5 embeddings and Vectorize (≤5M vectors /
  30k queries-day) are within the Cloudflare free tier for this corpus size
  (392 vectors, a few query embeddings per search).
- **If the vector half is unavailable** (AI/Vectorize error, or bindings
  missing): nothing breaks — the Worker falls back per-query to keyword-only
  and sets `degraded: true` in the response. Set `EMBEDDER=off` on the Worker
  to force keyword-only always.

> Note: `topK` is capped at 50 by Vectorize when `returnMetadata: 'all'` — the
> Worker keeps `topK ≤ 50`.

---

## 4. Security & secrets list

| Secret | Where it lives | Purpose |
|---|---|---|
| `MEILI_MASTER_KEY` | admin shell / indexer env only | create keys, update settings, index docs — **never** ships anywhere |
| `MEILI_SEARCH_KEY` | Worker secret (`wrangler secret put`) | the only key the service uses at query time; scoped `actions: ["search"]`, `indexes: ["recipes"]` |
| `MEILI_URL` | Worker secret | base URL of the hosted instance |
| `MEILI_INDEX` | Worker var | index name |
| `ALLOWED_ORIGINS` | Worker var | CORS — the static site's origin |
| `EMBEDDER` | Worker var | `default` (hybrid) or `off` (keyword) |
| `ANTHROPIC_API_KEY` | never (unless a generative feature reuses it) | not needed by this service |

The static build carries **no keys**: the only site-side config is
`VITE_SEARCH_ENDPOINT` (the Worker URL) and `VITE_SEARCH_HYBRID`.
See `.env.example` for the full sample.

Create the search-only key on the instance:

```bash
curl -s -H "Authorization: Bearer $MEILI_MASTER_KEY" -H "Content-Type: application/json" -X POST \
  https://<instance>.meilisearch.com/keys \
  -d '{ "description": "recipes public search-only",
        "actions": ["search"],
        "indexes": ["recipes"],
        "expiresAt": null }'
```

---

## 5. CORS / hosting — how the browser reaches the service

The site and the search service have different origins, so CORS is required:

- The Worker answers `OPTIONS` preflights and echoes the allowed
  `Access-Control-Allow-Origin` only for origins in `ALLOWED_ORIGINS`.
- Add the production site origin(s) there:
  - Cloudflare Pages (live host): `https://recipes.pages.dev` or the custom
    domain `https://recipes.serapiolabs.com`
  - Legacy GitHub Pages (`https://whitenick.github.io`) is deprecated (WILS-95)
    and no longer needs CORS entries — kept only for historical compatibility
  - Local dev: `http://localhost:5173`, `http://127.0.0.1:5173`
- The site sends requests with `fetch(workerUrl + '/search')`. No credentials
  header is needed — the Worker injects the Meilisearch key.

**Site migration (hosting rule):** the search service is live; the site is on
Cloudflare Pages — see `docs/backend-decision.md` §4 (Cloudflare Pages build
with `BASE_PATH=/`, DNS, Pages project for `dist/`). The Worker is host-
agnostic in the sense that `ALLOWED_ORIGINS` just lists the origin.

---

## 6. Verification & smoke test

`search/smoke.js` runs natural-language queries through the Worker handler and
asserts sensible top hits (plus CORS + degradation behaviour):

```bash
# Against a local Meilisearch (docker compose) with local Worker env:
MEILI_URL=http://localhost:7700 \
MEILI_SEARCH_KEY=<search-only key> \
node search/smoke.js
# pass:  5/5 queries with sensible top hits (hybrid, or "degraded" keyword)
# fail:  nonzero exit
```

Queries: `"quick chicken dinner"`, `"kale"`, `"salmon"`, `"pasta sauce"`,
`"vegetarian soup"` — each asserted to surface the expected ingredient/dish in
its top-5. Sample output:

```
✓ "quick chicken dinner" (chicken↑) hybrid → Chicken Cordon Bleu | …
✓ "kale" (kale↑) hybrid → Kale & White Bean Gratin | …
smoke: 5 passed, 0 failed
```

Unit tests for the Worker (CORS enforcement, hybrid→keyword retry,
filter building, degraded flag) live in `test/worker.test.js` and run with the
standard `npm test` suite (`node --test`).

---

## 7. Local verification (no Cloudflare account needed)

1. `docker compose -f search/docker-compose.yml up -d` (local Meilisearch).
2. Create a search-only key (`curl` above, against `localhost:7700`).
3. `MEILI_URL=http://localhost:7700 MEILI_MASTER_KEY=… node search/indexer.js`.
4. `MEILI_URL=http://localhost:7700 MEILI_SEARCH_KEY=<search key> npx wrangler dev`
   → `http://127.0.0.1:8787/search?q=chicken`.
5. `VITE_SEARCH_ENDPOINT=http://127.0.0.1:8787 npm run dev`
   → `http://localhost:5173/recipes/`; type a query and watch ranked results,
   or run `node search/smoke.js` for the headless check.

**To exercise the vector side locally without a paid embedder**, point the
index `embedder.default` at a free REST endpoint (Ollama, or any
OpenAI-compatible local server) and re-run `search/indexer.js` — the same
command as step 3, so reindex with/without vectors is identical.