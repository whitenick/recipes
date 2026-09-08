# 🍽 Nick's Kitchen

Personal recipe collection — searchable, mobile-friendly, and always up to date.

**Live site:** https://whitenick.github.io/recipes/

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
- Deployed via GitHub Pages (Actions workflow in `.github/workflows/pages.yml`)

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
# → http://localhost:5173/recipes/

# Production build → dist/
npm run build

# Preview the production build locally
npm run preview
# → http://localhost:4173/recipes/
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
- Frontend client: `src/search.js` (live, debounced, ranks results; falls back
  to local substring search when the service is unreachable).
- Hosting rule: the site migrates to Cloudflare (Pages + this Worker) the
  moment the search service is live — migration runbook in
  `docs/backend-decision.md` §4.

```bash
# After regenerating data/recipes.json, refresh the search index:
MEILI_URL=https://<instance>.meilisearch.com MEILI_MASTER_KEY=<master key> node search/indexer.js

# Build the site pointed at the search Worker (no key in the build):
VITE_SEARCH_ENDPOINT=https://recipes-search.<subdomain>.workers.dev BASE_PATH=/recipes/ npm run build
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

The GitHub Actions workflow (`.github/workflows/pages.yml`) builds the site and deploys `dist/` to GitHub Pages on every push to `main`:

1. `npm ci`
2. `npm test`
3. `npm run build` (with `BASE_PATH=/recipes/`)
4. Upload `dist/` → GitHub Pages

The Vite `base` is `/recipes/` (the repo is a GitHub Pages *project* site served at `https://whitenick.github.io/recipes/`). Should the site ever migrate to Cloudflare Pages, set `base: '/'` or `BASE_PATH=/` and the build output is directly deployable there — see the `vite.config.mjs` comment. (The WILS-4 AI Search service runs as a Cloudflare Worker out-of-band and does **not** require this migration — but per the hosting rule, wiring the live search bar is what triggers the site's Cloudflare Pages migration; see `docs/backend-decision.md` §4.)

## Integration Status (WILS-10)

The full pipeline is verified end-to-end as of the Vite Modernization handoff:

- ✅ `npm test` — 14 corpus/pipeline tests pass.
- ✅ `npm run build` — clean production build to `dist/` (all pages + recipe corpus asset, `BASE_PATH=/recipes/`).
- ✅ Production-equivalent check — `npm run preview` serves the built site at `/recipes/` with recipe data loading and all pages reachable.
- ✅ Host: **GitHub Pages** (static-only → GitHub Pages is the correct host per the hosting rule). No backend exists, so **no Cloudflare migration is needed yet** — see [`docs/backend-decision.md`](docs/backend-decision.md) for the pre-scoped Go service contract and the GitHub Pages → Cloudflare runbook to use the moment a backend lands.

**Handoff:** push to `main` triggers `.github/workflows/pages.yml` → build + deploy `dist/` to GitHub Pages. Nothing else is required to ship.

## Recipe Format

Recipes are Markdown files in `/home/jobin/obsidian-mac-vault/General/Personal/Culinary/Recipes/`.

The build script automatically extracts:
- Title (from `# Heading` or filename)
- Description (from Overview/Description sections)
- Metadata (prep time, cook time, servings)
- Categories (auto-detected from content)
- Ingredients (from lists and tables)