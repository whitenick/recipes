# Recipe Site Search & Layout Redesign

**Owner:** Frank (implementation) / Pierre (spec)
**Status:** Approved by Jobin — implement
**Live site:** recipes.serapiolabs.com (repo `/home/jobin/dev/recipes`)

The user likes the **search bar itself** and the **content of the search results**, but not the way they're presented. Three concrete changes ordered by impact.

---

## 1. Search results: drop the dropdown overlay, flow into the page

**Problem:** Typing in `#searchInput` renders ranked hits in `#searchDropdown` (`src/search-bar.js` → `.search-dropdown` in `index.html` line 83), which overlays the main page as a floating overlay. User finds the overlay disruptive and wants the results to be *part of* the page layout, not floating on top of it.

**Change:**
- Stop rendering results in a floating/dropdown container. Ranked hits should render into the established results region of the page (the existing `#recipeGrid` / `.main-content` area) — the bar is reactive with the page, results populate the page layout normally, nothing covers existing content.
- The `#searchDropdown` container should be removed or converted to a normal in-flow block (no `position:absolute`, no covering content). Any remaining abs-positioning for the dropdown should be eliminated.
- Keep the debounced AI-ranked search behavior, the state/status line ("Ranked by AI search", fallback notices, empty state), keyboard/mouse interaction, and the click-through-to-recipe behavior — but all of it lives in the page flow now.
- Empty/initial state: keep the page in its normal "Recent Recipes" view until a query produces results; typing filters/replaces that region in place.

## 2. Filters: move from side panel to a top bar

**Problem:** Category filters currently live in a left-hanging `aside.sidebar#categorySidebar` ("Full Menu", index.html line 130). User wants filters as a **top bar** instead of a side panel.

**Change:**
- Convert the desktop category filter from the `aside.sidebar` into a **horizontal top bar** of filter controls (the existing `#mobileFilters` horizontal chip bar at line 121 is the right visual pattern — promote that treatment to all breakpoints).
- Remove/replace the left sidebar layout (`aside.sidebar`, the `.page-layout`/`.main-content` side-by-side wrapper if it exists solely to host the sidebar).
- The top filter bar sits above the results, spanning full width, easy to scan and tap.
- Keep the same data-driven categories and "All" default; keep the count/empty behavior.

## 3. Results: rows instead of column cards

**Problem:** `#recipeGrid` renders as a column-card grid (`grid-template-columns: 1fr 1fr`, and the `repeat(auto-fill, minmax(200px,1fr))` variant). User wants **rows**.

**Change:**
- Switch the recipe results from column cards to **row-based list items** — each recipe is a horizontal row (title + description + tags/time on one line, or a compact horizontal card), stacking vertically down the page.
- Change `.recipe-grid`'s grid-template-columns to a single column (`1fr`) and restyle `.recipe-card` for a horizontal row layout, or introduce a `.recipe-list`/row component if cleaner.
- Ensure rows wrap/responsive well on mobile (stack cleanly full-width, keep tap targets).

---

## Acceptance criteria

- Typing in search populates the page's results region in-place; **nothing overlays the page**.
- Category filters are a **top bar**; the left sidebar is gone.
- Results are **rows**, not column cards.
- Existing behavior preserved: debounced AI search, status/fallback/empty copy, keyboard + mouse selection, click navigates to `#recipe/<id>`.
- Works across mobile and desktop breakpoints.

## Not in scope
- No change to the search backend/Worker, indexing, or recipe data.
- No change to the recipe detail view or grocery panel.