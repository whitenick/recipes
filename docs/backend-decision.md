# Backend decision — recipes site (WILS-9)

**Decision:** _No backend is required at this stage._ The recipes site stays a
pure-static Vite build on GitHub Pages. This document records why, pre-scopes
the Go service contract for when a backend is genuinely needed, and documents
the GitHub Pages → Cloudflare migration path the moment one lands.

Last reviewed: Stage 2 of the Vite Modernization project (WILS-9).

---

## 1. Outcome

- **No Go service ships in Stage 2.** All current features — search, facets,
  favorites, recipe detail, weekly plan, grocery list — run entirely
  client-side against `data/recipes.json` (384 normalized records) served as
  a static asset.
- GitHub Pages remains the live host (`https://whitenick.github.io/recipes/`),
  consistent with the hosting rule while the site is static.
- The Go backend is **pre-scoped and documented** (§3) so the moment a backend
  is genuinely required it ships in Go without re-deciding the architecture.
- The GitHub Pages → Cloudflare migration is **documented** (§4), not deferred
  to a vague follow-up.

## 2. Why no backend is needed now

1. **Search already works statically.** The search bar filters the corpus
   in-browser via substring match over title, description, categories, and
   ingredients (`src/main.js` `applyFilters`). Instant, free, private — no
   server round-trip. A backend buys the site nothing today.
2. **Nothing else needs a server.** No accounts, no writes to shared state, no
   per-request computation that static assets can't do. The weekly-plan/cooking
   log data lives in static JSON; "save" actions are localStorage.
3. **The search service is another project's deliverable.** The Meilisearch
   hybrid search backend is Stage 2 of the **Recipes - AI Search** project
   (WILS-4), which is gated on the Vite migration and not yet started. Building
   it here would duplicate that stage's contract, its hosted-Meilisearch
   decision (cost/fallback), and force a host migration before the feature it
   serves exists.
4. **The hosting rule makes a backend expensive.** The instant an API is real,
   the whole site leaves GitHub Pages. Shipping an unused backend to trigger a
   production host migration is the over-engineering this goal explicitly
   warns against ("Footprint minimal — document, don't over-engineer").

**Decision rule going forward:** a backend is required the moment (a) the AI
Search project's search stage activates, or (b) any feature needs
server-side logic that static hosting cannot do. When that happens, it is a
**Go** service per the Serapio Labs stack, deployed on the Cloudflare path
below.

## 3. Pre-scoped Go service contract (for the backend trigger)

When WILS-4 (search) or any real need activates, this is the agreed shape —
build exactly this, nothing more:

| Concern | Contract |
|---|---|
| Location | `search/` directory in this repo (sibling to `site/` assets) |
| Language | Go (statement) — no other backend language |
| Build | `go mod init` … `.`; `go build ./...`; `go test ./...` |
| Run | local dev on `localhost:8080`, config via env vars (sample `.env.example`, no real secrets) |
| Endpoints | `GET /health`; `GET /api/search?q=…&categories=…` (JSON in/out) |
| Indexer | initial + incremental sync of `data/recipes.json` → Meilisearch (documented reindex command); seed document per `docs/search-data-model.md` |
| Search | natural-language query endpoint; keyword-only fallback if embeddings unavailable |
| CORS | allow the static site origin (Cloudflare Pages `https://recipes.pages.dev` or custom domain) |
| Filters | categories + `meta` numeric facets (from the Stage 1 field contract), optional |
| Smoke test | `"quick chicken dinner"`-style query returns sensible top hits |

## 4. GitHub Pages → Cloudflare migration path (when the backend lands)

The hosting rule is absolute: the instant a backend/API exists, the **whole
site** moves to Cloudflare — no Pages-plus-VPS hybrid. This is the runbook.

1. **Vite base:** build with `BASE_PATH=/` (currently `BASE_PATH=/recipes/`).
   `vite.config.mjs` already keys off the env var; no code change needed beyond
   the deploy env.
2. **Static site:** deploy `dist/` to **Cloudflare Pages** — a separate Pages
   project, build command `npm ci && npm test && npm run build`, env
   `BASE_PATH=/`.
3. **Go service:** Cloudflare can't run a long-lived Go binary or Meilisearch.
   Two supported placements:
   - **Search API**: compile the Go service to WASM (Cloudflare Workers WASM /
     component mode) in front of a **hosted Meilisearch** (Meilisearch Cloud);
     the Worker runs the Go query logic, talks to the indexed corpus API. If
     the Go runtime surface is too large for Workers, the documented fallback
     (per AI Search WILS-4) is a thin JS Worker in front of Meilisearch — but
     any server-side logic that can run in a Worker stays Go.
   - **Env/secrets**: Cloudflare Pages → Workers with `KV`/env placeholder and
     signed-in secrets UI — never committed to the repo.
4. **CORS/origin:** the search endpoint allows the Pages origin
   (`https://<project>.pages.dev` or the custom domain); the site sends
   requests there.
5. **DNS:** repoint/register the custom domain in Cloudflare.
6. **Deprecate** the GitHub Pages deploy (`pages.yml`) once the CF deployment
   is verified live.
7. **Verification** lives in WILS-10 (integration stage): production build
   served from CF, search query returns results from the deployed origin,
   no regressions.

## 5. Acceptance mapping (Stage 2)

- **"Documented Go service OR explicit, justified 'no backend needed'"** — the
  no-backend branch, justified above; this file is the record.
- **`go build ./...` / `go test` pass** — not applicable: no Go project exists
  in this stage. The command contract is pinned in §3 for when one does.
- **README run + deploy docs** — see the Backend Status section in
  `README.md`; the migration runbook above plus this decision file constitute
  the deployment documentation for the (future) service.