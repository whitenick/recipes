/**
 * Nick's Kitchen — AI interactive search bar (WILS-5).
 *
 * Upgrades the existing #searchInput into a type-ahead autocomplete: debounced
 * natural-language queries go to the search service (src/search.js → Cloudflare
 * Worker → Meilisearch hybrid), and the ranked hits render below the bar as
 * recipe cards with keyboard + mouse navigation. Results link into the site's
 * recipe view (`#recipe/<id>` hash route).
 *
 * States surfaced in the dropdown status row:
 *   loading  — request in flight
 *   results  — ranked cards below the bar
 *   empty    — service answered, no matches
 *   fallback — search service not configured and/or unreachable: the existing
 *              client-side substring filter runs instead, and the dropdown
 *              says so in plain words (never a silent degradation)
 *   error    — the service errored mid-flight: same local-filter fallback
 *
 * The component is a plain Vite module — no framework, no new dependencies.
 * Pure helpers are exported so the node test suite can pin the contract
 * without a browser; DOM wiring only runs when `document` exists.
 */

export const SEARCH_DEBOUNCE_MS = 250;
export const MAX_RESULTS = 8;

const STATE_LOADING = 'loading';
const STATE_RESULTS = 'results';
const STATE_EMPTY = 'empty';
const STATE_FALLBACK = 'fallback';
const STATE_ERROR = 'error';

// ── Small safe-HTML helpers (mirror app.js escHtml) ──────

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Pure helpers (browser-free, test-covered) ────────────

/**
 * Decide which state the dropdown should surface for one search attempt.
 * Order matters: an in-flight request beats everything, an error beats an
 * unavailable-but-clean service, and only then do results/empty apply.
 */
export function pickState({ inFlight, error, available, hits }) {
  if (inFlight) return STATE_LOADING;
  if (error) return STATE_ERROR;
  if (available === false) return STATE_FALLBACK;
  if (hits && hits.length > 0) return STATE_RESULTS;
  return STATE_EMPTY;
}

/**
 * Human prep time from a search hit (numeric minutes first, then the recipe's
 * original text), or '' when the recipe carries neither.
 */
export function formatPrepTime(hit, localRecipe) {
  const minutes = hit && hit.prepTimeMinutes;
  if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
    return `${Math.round(minutes)} min`;
  }
  const text = localRecipe && localRecipe.meta && localRecipe.meta.prepTime;
  return typeof text === 'string' && text.trim() ? text.trim() : '';
}

/**
 * Markup for one ranked hit — a compact recipe card: name, dietary/meal-type/
 * category tags, prep time, and a link into the recipe view. Ships no markup
 * for fields the hit is missing; every value is HTML-escaped.
 */
export function resultCardMarkup(hit, localRecipe) {
  localRecipe = localRecipe || {};
  const id = (hit && hit.id) || localRecipe.id || '';
  const title = (hit && hit.title) || localRecipe.title || 'Untitled';
  const categories = (hit && Array.isArray(hit.categories))
    ? hit.categories
    : (Array.isArray(localRecipe.categories) ? localRecipe.categories : []);
  const time = formatPrepTime(hit, localRecipe);

  const descRaw = (hit && hit.description) || localRecipe.description || '';
  let desc = descRaw
    .replace(/^- \*\*[^*]+\*\*:.*$/gm, '')
    .replace(/^\d+ \w+.*$/m, '')
    .replace(/\[Title\]/gi, '')
    .trim();
  if (desc.length > 64) desc = desc.slice(0, 61) + '…';

  const cats =
    categories.length
      ? `<div class="search-result-cats">${categories.map((c) => `<span>${escapeHtml(c)}</span>`).join('')}</div>`
      : '';

  return `
    <a class="search-result" href="#recipe/${escapeHtml(id)}" data-id="${escapeHtml(id)}" role="option">
      <div class="search-result-body">
        <div class="search-result-title">${escapeHtml(title)}</div>
        ${desc ? `<div class="search-result-desc">${escapeHtml(desc)}</div>` : ''}
        ${cats}
      </div>
      ${time ? `<div class="search-result-time">⏱ ${escapeHtml(time)}</div>` : ''}
    </a>`;
}

/**
 * Markup for the dropdown status row, one line of muted copy per state.
 * `degraded` (hybrid→keyword) is surfaced as a subtle note under results.
 */
export function statusMarkup(state, { degraded = false } = {}) {
  switch (state) {
    case STATE_LOADING:
      return `Ranking matches…`;
    case STATE_EMPTY:
      return `No matches — try a different craving`;
    case STATE_FALLBACK:
      return `🔍 Search service offline — showing local text matches`;
    case STATE_ERROR:
      return `⚠️ Search service unreachable — showing local text matches`;
    case STATE_RESULTS:
      return degraded
        ? `Ranked by AI search · semantic matching unavailable`
        : `Ranked by AI search`;
    default:
      return '';
  }
}

// ── Component (DOM wiring; no-ops without a browser) ─────

/**
 * Wire #searchInput into an autocomplete search bar.
 *
 * @param {object} deps
 *   search     async (query, limit) => Promise<{hits, available, degraded}>
 *   onSelect   (recipeId) => void            — navigate to the recipe view
 *   onRanked   (hits, query) => void         — live-update the grid behind the bar
 *   onFallback (query) => void               — run the local substring filter
 *   lookupRecipe (recipeId) => object|null   — full recipe for a hit id (display)
 *   debounceMs debounce delay (default SEARCH_DEBOUNCE_MS)
 * @returns {{ destroy(): void } | null} controller (null outside a browser)
 */
export function createSearchBar({
  search,
  onSelect,
  onRanked,
  onFallback,
  lookupRecipe = () => null,
  debounceMs = SEARCH_DEBOUNCE_MS,
}) {
  if (typeof document === 'undefined') return null;

  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchDropdown');
  const resultsEl = document.getElementById('searchResults');
  const statusEl = document.getElementById('searchDropdownStatus');
  if (!input || !dropdown || !resultsEl || !statusEl) return null;

  let debounceTimer = null;
  let seq = 0;
  let activeIndex = -1;

  function setState(state, { degraded = false } = {}) {
    statusEl.hidden = false;
    statusEl.textContent = statusMarkup(state, { degraded });
  }

  function renderResults(hits) {
    resultsEl.innerHTML = hits.map((h) => resultCardMarkup(h, lookupRecipe(h && h.id))).join('');
    activeIndex = -1;
    highlightActive();
  }

  function open() {
    dropdown.hidden = false;
  }

  function close() {
    dropdown.hidden = true;
    seq += 1; // drop any in-flight response
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    activeIndex = -1;
  }

  function resultEls() {
    return Array.from(resultsEl.querySelectorAll('.search-result'));
  }

  function highlightActive() {
    const els = resultEls();
    els.forEach((el, i) => {
      const on = i === activeIndex;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function moveActive(delta) {
    const els = resultEls();
    if (!els.length) return;
    activeIndex = (activeIndex + delta + els.length) % els.length;
    highlightActive();
  }

  function selectIndex(i) {
    const els = resultEls();
    if (i >= 0 && i < els.length && typeof onSelect === 'function') {
      const id = els[i].dataset.id;
      close();
      onSelect(id);
    }
  }

  async function runSearch() {
    const query = input.value.trim();
    const current = ++seq;
    if (!query) {
      open();
      setState(STATE_FALLBACK);
      if (typeof onFallback === 'function') onFallback('');
      return;
    }

    open();
    setState(STATE_LOADING);

    let result;
    try {
      result = await search(query, MAX_RESULTS);
    } catch (err) {
      if (current !== seq) return; // superseded
      setState(STATE_ERROR);
      if (typeof onFallback === 'function') onFallback(query);
      return;
    }
    if (current !== seq || input.value.trim() !== query) return; // stale

    const { hits = [], available = true, degraded = false } = result || {};
    setState(pickState({ inFlight: false, error: false, available, hits }), { degraded });

    if (hits.length) {
      renderResults(hits);
      if (typeof onRanked === 'function') onRanked(hits, query);
    } else if (available !== false) {
      resultsEl.innerHTML = '';
      if (typeof onRanked === 'function') onRanked([], query);
    } else if (typeof onFallback === 'function') {
      onFallback(query);
    }
  }

  function onInput() {
    const query = input.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!query) {
      seq += 1;
      open();
      setState(STATE_FALLBACK);
      if (typeof onFallback === 'function') onFallback('');
      return;
    }
    if (typeof onFallback === 'function') onFallback(query); // keep grid snappy while waiting
    open();
    setState(STATE_LOADING);
    debounceTimer = setTimeout(runSearch, debounceMs);
  }

  function onKeydown(e) {
    if (dropdown.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectIndex(activeIndex);
      } else {
        close();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);

  // Mouse: hover moves the highlight; click selects and navigates.
  resultsEl.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.search-result');
    if (!el) return;
    const idx = resultEls().indexOf(el);
    if (idx !== activeIndex) {
      activeIndex = idx;
      highlightActive();
    }
  });
  resultsEl.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.search-result');
    if (!el) return;
    e.preventDefault();
    if (typeof onSelect === 'function') {
      const id = el.dataset.id;
      close();
      onSelect(id);
    }
  });

  // Clicking anywhere outside the search box closes the dropdown.
  document.addEventListener('pointerdown', (e) => {
    if (dropdown.hidden) return;
    if (input.contains(e.target) || dropdown.contains(e.target)) return;
    close();
  });

  // Losing focus closes the dropdown (slight delay lets card clicks land).
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== input) close();
    }, 150);
  });

  return {
    destroy() {
      clearTimeout(debounceTimer);
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
      seq += 1;
    },
  };
}