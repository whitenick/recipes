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

`data/recipes.json` is the normalized corpus consumed by the (upcoming)
search service. See [`docs/search-data-model.md`](docs/search-data-model.md)
for the field contract, searchable-vs-filterable mapping, and rebuild/reindex
instructions.

## Backend Status (WILS-9)

**No backend is currently required** — the site is fully static and search runs
client-side over the corpus. The moment a backend is genuinely needed (the AI
Search service, auth, or any server-side piece), it will be a **Go** service and
the **whole site migrates to Cloudflare**. The decision record, the pre-scoped Go
service contract, and the GitHub Pages → Cloudflare runbook live in
[`docs/backend-decision.md`](docs/backend-decision.md).

## Deploying

The GitHub Actions workflow (`.github/workflows/pages.yml`) builds the site and deploys `dist/` to GitHub Pages on every push to `main`:

1. `npm ci`
2. `npm test`
3. `npm run build` (with `BASE_PATH=/recipes/`)
4. Upload `dist/` → GitHub Pages

The Vite `base` is `/recipes/` (the repo is a GitHub Pages *project* site served at `https://whitenick.github.io/recipes/`). If the site ever moves to Cloudflare Pages (the required migration the moment a backend/API exists), set `base: '/'` or `BASE_PATH=/` and the build output is directly deployable there — see the `vite.config.mjs` comment.

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