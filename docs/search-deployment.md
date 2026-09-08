# AI Search — Meilisearch self-hosted (WILS-17)

This project replaces the site's client-side substring search with **live,
ranked, typo-tolerant search-as-you-type** backed by a **self-hosted
Meilisearch** sidecar running hybrid (keyword + vector) search. The recipes
site itself stays a static build on GitHub Pages; only the **search queries**
go to an out-of-band server. Nothing else on the site needs a backend, so the
`docs/backend-decision.md` "no backend needed" record still holds for the rest
of the app.

> ⚠️ This is additive and **opt-in**: if no Meilisearch endpoint is configured,
> the site keeps working exactly as before with the local substring filter.
> The backend is a search *improvement*, never a hard dependency.

---

## Architecture at a glance

```
GitHub Pages (static site)          VPS sidecar
┌────────────────────────────┐      ┌──────────────────────┐
│ index.html → src/main.js   │      │ Meilisearch:7700     │
│  ├─ src/search.js          │ ───▶ │  index "recipes"     │
│  │   POST /indexes/recipes │ Auth │  └─ hybrid embedder  │
│  │   /search (search key)  │      └───────(Ollama local) │
│  └─ fallback: substring    │      └────── Meili data.ms  │
└────────────────────────────┘      └──────────────────────┘
        data/recipes.json ──▶ search/indexer.js (build step) ──▶ Meilisearch
```

---

## 1. Indexing

`search/indexer.js` reads `data/recipes.json` and pushes each recipe as a
Meilisearch document. It builds a `searchable_text` blob from the title,
description, categories, ingredients, **and** the markdown-stripped body, so
ingredient and instruction queries ("kale", "simmer 20 minutes") match. The
raw `content` field is **not** shipped to the index — only the derived search
text — per `docs/search-data-model.md`.

To re-index after `data/recipes.json` changes (e.g. after `bash update.sh`):

```bash
MEILI_URL="https://search.example.com" \
MEILI_MASTER_KEY="<master key>" \
node search/indexer.js
```

Offline / CI-safe modes (no network, no key required):

```bash
node search/indexer.js --dry-run   # validate + count
node search/indexer.js --dump seed.json   # emit the projected seed for review
```

The indexer pins the **primary key to `id`**, sets `searchableAttributes`
(title, description, ingredients, categories, searchable_text),
`filterableAttributes` (categories + `meta.*Minutes` numeric facets), and
`sortableAttributes` (`dateAdded`) — exactly the field contract in
`docs/search-data-model.md` so the existing facet UI stays applicable.

---

## 2. Server — self-hosted Meilisearch (Docker)

`search/docker-compose.yml` runs Meilisearch on a small VPS. Bring it up:

```bash
MEILI_MASTER_KEY="$(openssl rand -hex 32)" docker compose up -d
```

> **CORS is the key hosting detail.** Browser JS from `https://whitenick.github.io`
> calls Meilisearch directly, so Meilisearch must allow that origin. The compose
> file sets `MEILI_HTTP_CORS_ORIGIN` to the Pages origin (plus `localhost:5173`
> for local dev). Without it, the site's request is blocked by the browser.
>
> **Cloud-vs-self-host CORS tradeoff:** Meilisearch Cloud manages CORS for you
> behind its proxy and cannot serve arbitrary origins; self-hosting is what lets
> you set `MEILI_HTTP_CORS_ORIGIN` yourself. That's the main reason this stage
> chose self-hosted. It also means **you** own TLS (put a reverse proxy such as
> Caddy/nginx/Traefik in front of `:7700`) and uptime.

### Security — never expose the master key

- The master key controls admin operations and lives **only** in the VPS env
  (`MEILI_MASTER_KEY` in the shell / compose). It is never shipped to the site.
- Create a **search-only key** scoped to the `recipes` index and hand *that* to
  the site:

```bash
curl -s -H "Authorization: Bearer $MEILI_MASTER_KEY" -X POST \
  http://localhost:7700/keys \
  -d '{ "description": "recipes public search-only",
        "actions": ["search"],
        "indexes": ["recipes"],
        "expiresAt": null }'
```

The returned `key` is what you bake into the build as `VITE_SEARCH_KEY`.
See `docs/search-deployment.md` → sensitive-operation / tenant-token tradeoff
below before considering signed keys.

---

## 3. Frontend — hybrid search-as-you-type

`src/search.js` is a thin client. It is enabled **only** through build-time
env vars, so no secret lives in source control. When unset, `searchRecipes`
reports itself unavailable and `src/main.js` keeps the pre-existing local
substring filter — the site degrades gracefully.

Build with Meilisearch pointed at the VPS:

```bash
VITE_SEARCH_ENDPOINT="https://search.example.com" \
VITE_SEARCH_KEY="<search-only key from §2>" \
VITE_SEARCH_INDEX="recipes" \
VITE_SEARCH_HYBRID="true" \
BASE_PATH=/recipes/ npm run build
```

Typing in the search box is debounced (~250 ms) and one `POST
/indexes/recipes/search` call is made with `hybrid: { embedder: "default" }`
for vector + keyword fusion. Ranked hits reorder the grid; category and
favorites filters are still applied on top of the ranking. If the sidecar
errors or times out, the UI falls back to the local filter, so a VPS outage
never takes the search bar down.

---

## 4. Hybrid search — embedder decision

Meilisearch fuses keyword (`searchableAttributes`) and vector (embedder)
results into one ranking. The vector half needs an embedder. Decision for this
stage:

- **Free, local embedder preferred — no external API cost or data leaving the
  VPS.** The reference is the **Ollama embedder** (`source: "ollama"`) using a
  local model such as `nomic-embed-text` or `mxbai-embed-large`. If you use the
  compose file's commented `ollama` service, configure the index embedder:

  ```bash
  curl -s -H "Authorization: Bearer $MEILI_MASTER_KEY" -X PATCH \
    http://localhost:7700/indexes/recipes/settings \
    -d '{ "embedders": { "default": { "source": "rest", "url": "http://localhost:11434/api/embed", "request": { "model": "nomic-embed-text" }, "query": { "input": ["{{embedding}}"] } } } }'
  ```

  (`source: "rest"` against Ollama's `/api/embed` is the free-local option;
  `source: "ollama"` is equivalent when Meilisearch can reach Ollama directly.)

- **Documented tradeoff if a remote embedder is used instead.** Meilisearch's
  `openAi` and `huggingFace` embedder sources call external APIs: per-request
  cost, an API key required on the VPS, and text leaves the box. Choose them
  only if you prefer a hosted model (stronger multilingual/quality for a fee);
  they change nothing else in this pipeline.

---

## 5. Re-index when the corpus changes

`data/recipes.json` is build output regenerated by `bash update.sh`
(`node build.js` from the Obsidian vault). Rebuild then re-push:

```bash
bash update.sh                      # regenerates data/recipes.json + deploys site
MEILI_URL=... MEILI_MASTER_KEY=... node search/indexer.js   # refresh the search index
```

`search/indexer.js` is idempotent (add-or-replace by `id`), so re-running it is
safe and fast.

---

## 6. Sensitive operations & tenant-token tradeoff (recorded)

- The public client uses a **search-only key** (`actions: ["search"]`) scoped to
  the `recipes` index. It can match and read documents — it **cannot** create
  keys, change settings, update documents, or delete. This satisfies the
  "master key never on the client" rule.
- Meilisearch also offers **signed tenant tokens** (`apiKeyUid` + HMAC JWT) to
  scope a single key per user for personalized search. Tradeoff considered:
  tenant tokens let you revoke per-user and encrypt `_tenantToken` filters, but
  add signing infrastructure (a server holding the key) that this static site
  doesn't have. For a public personal recipe index, a single search-only key
  across all visitors is the right, simplest secure default. Revisit tenant
  tokens only if per-user access control is ever needed.
- Keep the search-only key's `expiresAt` handled: set `null` and rotate via the
  same create-key call if leaked.

---

## Local verification (without a VPS)

1. `docker compose -f search/docker-compose.yml up -d` with `MEILI_MASTER_KEY` set.
2. Create a search-only key (curl above).
3. `MEILI_URL=http://localhost:7700 MEILI_MASTER_KEY=... node search/indexer.js`.
4. `VITE_SEARCH_ENDPOINT=http://localhost:7700 VITE_SEARCH_KEY="<search key>" npm run dev`
   → `http://localhost:5173/recipes/`; type a query and watch ranked, typo-tolerant results.