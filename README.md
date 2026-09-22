# 🍽 Nick's Kitchen

Personal recipe collection — searchable, mobile-friendly, and always up to date.

**Live site:** https://recipes.serapiolabs.com/

## Features

- 🔍 Search by name, ingredient, or category
- 📱 Mobile-friendly responsive design
- ♥️ Save favorites to local storage
- 🖨️ Print-friendly recipe view
- ⚡ Fast, static site — no server needed

## Tech

- **Vite** frontend build (Serapio Labs stack) — plain HTML/CSS/JS modules, no framework
- Markdown rendered with `marked.js`
- Recipes parsed from Obsidian `.md` files
- Hosted on **Cloudflare Pages** at `https://recipes.serapiolabs.com/` (Git integration, auto-deploys on push to `main`)

## Updating Recipes

When you add new `.md` files to the Obsidian vault, run:

```bash
bash update.sh
```

This rebuilds `data/recipes.json` from the Obsidian vault and pushes to GitHub. The site auto-updates in ~30 seconds.

## Local Development

```bash
# Install dependencies (first time)
npm install

# Rebuild recipe index (RECIPES_DIR overrides the vault path when set)
RECIPES_DIR="/path/to/.../Recipes" node build.js

# Run the corpus/pipeline tests
node --test

# Start the Vite dev server
npm run dev
# → http://localhost:5173/

# Production build → dist/
npm run build

# Preview the production build locally
npm run preview
# → http://localhost:4173/
```

## Search Data Model

`data/recipes.json` is the normalized corpus consumed by the search service. See
[`docs/search-data-model.md`](docs/search-data-model.md) for the field contract,
searchable-vs-filterable mapping, and rebuild/reindex instructions.

## AI Search (WILS-4) — Cloudflare Worker + hosted Meilisearch

The site's search bar is **hybrid (keyword + vector) live search** against a
**Cloudflare Worker in front of hosted Meilisearch**, replacing the old
client-side substring filter. It is **opt-in**: unless a search endpoint is
configured at build time, the site keeps the local substring filter exactly as
before.

- Search service: `search/worker/` (Cloudflare Worker — CORS, server-side key,
  hybrid→keyword fallback). Deploy + full docs in
  [`docs/search-deployment.md`](docs/search-deployment.md).
- Indexer: `node search/indexer.js` (reads `data/recipes.json` → Meilisearch;
  one idempotent command for initial + incremental sync).
- Frontend search bar: `src/search-bar.js` — a type-ahead autocomplete over
  `#searchInput` (debounced queries, keyboard + mouse navigation, loading /
  empty / error states, results as recipe cards). Each ranked hit also drives
  the grid order via `src/main.js`. When the service is missing or
  unreachable the dropdown says so in plain words and the classic local
  substring filter (`applyFilters()`) takes over — the degradation is always
  visible, never silent.
- Hosting rule: the site migrates to Cloudflare (Pages + this Worker) the
  moment the search service is live — migration runbook in
  `docs/backend-decision.md` §4.

```bash
# After regenerating data/recipes.json, refresh the search index:
MEILI_URL=https://<instance>.meilisearch.com MEILI_MASTER_KEY=<master key> node search/indexer.js

# Build the site pointed at the search Worker (no key in the build):
VITE_SEARCH_ENDPOINT=https://recipes-search.<subdomain>.workers.dev npm run build
```

The Meilisearch key never reaches the browser — the Worker holds
`MEILI_SEARCH_KEY` as a secret. If embeddings are unavailable the service
degrades each query to keyword-only (`degraded: true`).

## Backend Status (WILS-9)

The site itself stays fully static — only **search queries** go out-of-band to
the Cloudflare-hosted search service (WILS-4). Aside from that, no app server
exists and no full site migration is pending; the "no backend for the rest of
the app" record, the pre-scoped Go service contract, and the GitHub Pages →
Cloudflare runbook live in
[`docs/backend-decision.md`](docs/backend-decision.md).

## Deploying

The site is hosted on **Cloudflare Pages** at `https://recipes.serapiolabs.com/`. The
Cloudflare project is connected to this repo via Git integration, so every push to
`main` is built and deployed by Cloudflare (root-path build, `VITE_SEARCH_ENDPOINT`
set in the Cloudflare project's build env). Configuration for that deploy lives in
the Cloudflare dashboard, not in this repo.

### Legacy GitHub Pages redirect

`https://whitenick.github.io/recipes` no longer hosts the site. A GitHub Actions
workflow (`.github/workflows/pages.yml`) deploys a tiny redirect stub
(`redirect/`) that bounces every request to the canonical Cloudflare domain,
preserving the path. The workflow also runs `npm ci && npm test && npm run build`
as a CI gate on push.

## Integration Status (WILS-10 / WILS-92)

The full pipeline is verified end-to-end as of the Cloudflare Pages migration:

- ✅ `npm test` — 14 corpus/pipeline tests pass.
- ✅ `npm run build` — clean production build to `dist/` (all pages + recipe corpus asset, root-relative paths).
- ✅ Production-equivalent check — `npm run preview` serves the built site at `/` with recipe data loading and all pages reachable.
- ✅ Host: **Cloudflare Pages** (`https://recipes.serapiolabs.com/`).

**Handoff:** push to `main` triggers the Cloudflare Pages Git integration → build + deploy to Cloudflare Pages. The repo workflow (`pages.yml`) runs CI (`npm test`) and keeps a redirect-only stub on the legacy GitHub Pages URL. Nothing else is required to ship.

## AI Search Integration (WILS-6)

The AI search bar is **live in the site shell** (`index.html` `search-wrap`,
wired in `src/main.js` via `src/search-bar.js`), so it ships with every
production build — not a dev-only page. It is **opt-in**: when
`VITE_SEARCH_ENDPOINT` is set at build time the bar runs live ranked search
against the Cloudflare Worker; when it is unset (e.g. a build without the
endpoint env) the bar falls back to the classic local substring filter and says so
in the dropdown — full acceptance checklist on WILS-6.

**Current verification status (WILS-6):** all checks ran **locally**:

- ✅ `npm test` — 38/38 pass (search-bar, worker, indexer, corpus, recipes).
- ✅ `npm run build` — clean production build; search bar markup + JS present in `dist/`.
- ✅ `npm run preview` — built site serves at `/` with the search bar.
- ✅ Service behaviour — exercised via `npm run smoke:search` and the worker
  test suite (local: against real Meilisearch in Docker, per WILS-4). Docker is
  not required to build/test the site.
- ⏳ **Deployed endpoints** (Worker + Pages) are **not yet live** — remote
  deploy requires Nick's Cloudflare account and is the step below.

**Handoff — to go live (one-time):**

1. Deploy the search Worker: `cd search/worker && npx wrangler deploy`, then
   `npx wrangler secret put MEILI_URL` / `MEILI_SEARCH_KEY` (see
   `docs/search-deployment.md` §1/§4).
2. Host Meilisearch and seed: `MEILI_URL=... MEILI_MASTER_KEY=... node search/indexer.js`
   (one command; see `docs/search-deployment.md` §2).
3. Rebuild the site pointed at the Worker so the live bar queries it:
   `VITE_SEARCH_ENDPOINT=<worker-url> npm run build` and deploy — **Cloudflare
   Pages works as-is** (CORS already allows `https://recipes.serapiolabs.com`).

Reindex after any corpus rebuild is the same single command above (idempotent).
Env sample: `.env.example` — no real secrets committed.

## Recipe Format

Recipes are Markdown files in `/home/jobin/obsidian-mac-vault/General/Personal/Culinary/Recipes/`.

The build script automatically extracts:
- Title (from `# Heading` or filename)
- Description (from Overview/Description sections)
- Metadata (prep time, cook time, servings)
- Categories (auto-detected from content)
- Ingredients (from lists and tables)