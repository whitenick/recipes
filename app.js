/**
 * Nick's Kitchen — App
 */

// ── State ──────────────────────────────────────────────
let allRecipes = [];
let filteredRecipes = [];
let currentCategory = '';
let currentSearch = '';
let currentView = 'grid'; // 'grid' | 'list'
let favoritesOnly = false;
let favorites = new Set(JSON.parse(localStorage.getItem('ns-favorites') || '[]'));

// ── Init ───────────────────────────────────────────────
async function init() {
  // Handle hash-based routing
  window.addEventListener('hashchange', handleRoute);
  
  // Load recipes
  try {
    const res = await fetch('data/recipes.json');
    if (!res.ok) throw new Error('Failed to load recipes');
    allRecipes = await res.json();
  } catch (err) {
    console.error('Error loading recipes:', err);
    document.getElementById('recipeGrid').innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <p>Couldn't load recipes. Make sure the build script has been run.</p>
      </div>
    `;
    return;
  }

  buildCategoryChips();
  updateFavCount();
  loadWeeklyPlan();
  
  // Wire up events
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  const gridViewBtn = document.getElementById('gridViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');
  const backBtn = document.getElementById('backBtn');
  const favoritesToggle = document.getElementById('favoritesToggle');

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim();
    searchClear.style.display = currentSearch ? 'flex' : 'none';
    applyFilters();
  });
  
  searchClear.addEventListener('click', clearSearch);
  
  gridViewBtn.addEventListener('click', () => setView('grid'));
  listViewBtn.addEventListener('click', () => setView('list'));
  
  backBtn.addEventListener('click', () => {
    window.location.hash = '';
  });
  
  favoritesToggle.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoritesToggle.classList.toggle('active', favoritesOnly);
    applyFilters();
  });

  document.getElementById('printBtn').addEventListener('click', () => window.print());
  
  // Handle initial route
  handleRoute();
}

// ── Routing ────────────────────────────────────────────
function handleRoute() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#recipe/')) {
    const id = hash.slice('#recipe/'.length);
    const recipe = allRecipes.find(r => r.id === id);
    if (recipe) {
      showDetail(recipe);
      return;
    }
  }
  showList();
}

// ── Category Chips ──────────────────────────────────────
function buildCategoryChips() {
  const allCategories = new Set();
  allRecipes.forEach(r => r.categories.forEach(c => allCategories.add(c)));
  
  const sorted = [...allCategories].sort();
  const container = document.querySelector('.filters-scroll');
  
  sorted.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.dataset.category = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => setCategory(cat));
    container.appendChild(btn);
  });
  
  // Wire up "All" chip
  container.querySelector('[data-category=""]').addEventListener('click', () => setCategory(''));
  
  applyFilters();
}

function setCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === cat);
  });
  // Scroll active chip into view
  const activeChip = document.querySelector('.filter-chip.active');
  if (activeChip) activeChip.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  applyFilters();
}

// ── Filtering / Search ─────────────────────────────────
function applyFilters() {
  const query = currentSearch.toLowerCase();
  
  filteredRecipes = allRecipes.filter(recipe => {
    // Favorites filter
    if (favoritesOnly && !favorites.has(recipe.id)) return false;
    
    // Category filter
    if (currentCategory && !recipe.categories.includes(currentCategory)) return false;
    
    // Search filter
    if (query) {
      const titleMatch = recipe.title.toLowerCase().includes(query);
      const descMatch = recipe.description.toLowerCase().includes(query);
      const categoryMatch = recipe.categories.some(c => c.toLowerCase().includes(query));
      const ingredientMatch = recipe.ingredients.some(i => i.toLowerCase().includes(query));
      if (!titleMatch && !descMatch && !categoryMatch && !ingredientMatch) return false;
    }
    
    return true;
  });
  
  renderGrid();
  updateResultsMeta();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  currentSearch = '';
  document.getElementById('searchClear').style.display = 'none';
  applyFilters();
}

function updateResultsMeta() {
  const meta = document.getElementById('resultsMeta');
  const total = allRecipes.length;
  const shown = filteredRecipes.length;
  
  if (currentSearch || currentCategory || favoritesOnly) {
    meta.textContent = `${shown} of ${total}`;
  } else {
    meta.textContent = `${total} recipes`;
  }
}

// ── View Toggle ────────────────────────────────────────
function setView(view) {
  currentView = view;
  const grid = document.getElementById('recipeGrid');
  const gridBtn = document.getElementById('gridViewBtn');
  const listBtn = document.getElementById('listViewBtn');
  
  if (view === 'list') {
    grid.classList.add('list-view');
    gridBtn.classList.remove('active');
    listBtn.classList.add('active');
  } else {
    grid.classList.remove('list-view');
    gridBtn.classList.add('active');
    listBtn.classList.remove('active');
  }
}

// ── Emoji Mapping ───────────────────────────────────────
function getEmoji(recipe) {
  const cats = recipe.categories.join(' ').toLowerCase();
  const title = recipe.title.toLowerCase();
  
  if (cats.includes('seafood') || title.includes('salmon') || title.includes('fish') || title.includes('shrimp') || title.includes('trout')) return '🐟';
  if (cats.includes('chicken') || title.includes('chicken')) return '🍗';
  if (cats.includes('beef') || title.includes('beef') || title.includes('burger') || title.includes('steak')) return '🥩';
  if (cats.includes('pasta') || title.includes('lasagna') || title.includes('bolognese')) return '🍝';
  if (cats.includes('baking') || title.includes('bread') || title.includes('popover')) return '🍞';
  if (cats.includes('breakfast') || title.includes('quiche') || title.includes('egg')) return '🍳';
  if (cats.includes('soups') || title.includes('soup') || title.includes('stew') || title.includes('congee') || title.includes('gazpacho')) return '🥣';
  if (cats.includes('salad') || title.includes('salad') || title.includes('panzanella')) return '🥗';
  if (cats.includes('vegetarian') || title.includes('vegetable') || title.includes('eggplant') || title.includes('zucchini')) return '🥦';
  if (cats.includes('sauce') || title.includes('sauce') || title.includes('relish') || title.includes('chimichurri')) return '🫙';
  return '🍽️';
}

// ── Grid Render ────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('recipeGrid');
  const empty = document.getElementById('emptyState');
  
  if (filteredRecipes.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  grid.style.display = '';
  empty.style.display = 'none';
  
  grid.innerHTML = filteredRecipes.map((recipe, i) => renderCard(recipe, i)).join('');
  
  // Attach event listeners
  grid.querySelectorAll('.recipe-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-fav')) return;
      window.location.hash = `recipe/${id}`;
    });
    
    const favBtn = card.querySelector('.card-fav');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(id);
        // Update just this card's fav button
        updateCardFav(favBtn, id);
        if (favoritesOnly) applyFilters();
      });
    }
  });
}

function renderCard(recipe, index) {
  const isFav = favorites.has(recipe.id);
  const tags = recipe.categories.slice(0, 2);
  const hasMeta = recipe.meta.totalTime || recipe.meta.cookTime || recipe.meta.servings;
  const num = String(index + 1).padStart(2, '0');
  
  return `
    <div class="recipe-card" data-id="${recipe.id}">
      <div class="card-category-bar"></div>
      <button class="card-fav ${isFav ? 'active' : ''}" title="${isFav ? 'Remove' : 'Save'}">
        ${isFav ? '♥' : '♡'}
      </button>
      <div class="card-body">
        <div class="card-number">${num}</div>
        <div class="card-title">${escHtml(recipe.title)}</div>
        ${recipe.description ? `<div class="card-desc">${escHtml(recipe.description)}</div>` : ''}
        <div class="card-divider"></div>
        <div class="card-meta">
          ${recipe.meta.totalTime || recipe.meta.cookTime ? `
            <span class="card-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              ${escHtml(recipe.meta.totalTime || recipe.meta.cookTime)}
            </span>
          ` : ''}
          ${recipe.meta.servings ? `
            <span class="card-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              ${escHtml(recipe.meta.servings)}
            </span>
          ` : ''}
          ${!hasMeta ? `<div class="card-tags">${tags.map(t => `<span class="tag ${tagClass(t)}">${escHtml(t)}</span>`).join('')}</div>` : ''}
          ${hasMeta ? `<div class="card-tags" style="margin-left:auto">${tags.map(t => `<span class="tag ${tagClass(t)}">${escHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function updateCardFav(btn, id) {
  const isFav = favorites.has(id);
  btn.classList.toggle('active', isFav);
  btn.textContent = isFav ? '♥' : '♡';
  btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
}

function tagClass(cat) {
  const map = {
    'Seafood': 'seafood', 'Chicken': 'chicken', 'Beef': 'beef', 'Pork': 'beef',
    'Baking': 'baking', 'Vegetarian': 'vegetarian', 'Vegan': 'vegetarian',
    'Soups & Stews': 'soup', 'Pasta': 'pasta', 'Breakfast': 'breakfast',
    'Salads': 'salad', 'Sauces & Condiments': 'sauce'
  };
  return map[cat] || '';
}

// ── Detail View ────────────────────────────────────────
function showDetail(recipe) {
  document.getElementById('listView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  document.getElementById('printBtn').style.display = 'flex';
  window.scrollTo(0, 0);
  
  const isFav = favorites.has(recipe.id);
  const hasMeta = recipe.meta.totalTime || recipe.meta.cookTime || recipe.meta.prepTime || recipe.meta.servings;
  
  // Build meta grid items
  const metaItems = [];
  if (recipe.meta.prepTime) metaItems.push({ label: 'Prep Time', value: recipe.meta.prepTime });
  if (recipe.meta.cookTime) metaItems.push({ label: 'Cook Time', value: recipe.meta.cookTime });
  if (recipe.meta.totalTime) metaItems.push({ label: 'Total Time', value: recipe.meta.totalTime });
  if (recipe.meta.servings) metaItems.push({ label: 'Servings', value: recipe.meta.servings });
  
  // Render markdown (strip the h1 title from content since we show it separately)
  let mdContent = recipe.content;
  // Remove leading source URL if present
  mdContent = mdContent.replace(/^Source:\s*https?:\/\/[^\n]+\n*/i, '');
  mdContent = mdContent.replace(/^https?:\/\/[^\n]+\n*/m, '');
  
  const rendered = typeof marked !== 'undefined' 
    ? marked.parse(mdContent) 
    : `<pre style="white-space:pre-wrap">${escHtml(mdContent)}</pre>`;
  
  document.getElementById('recipeDetail').innerHTML = `
    <div class="detail-header">
      <div class="detail-eyebrow">${recipe.categories.join(' &nbsp;·&nbsp; ')}</div>
      <h1 class="detail-title">${escHtml(recipe.title)}</h1>
      ${recipe.description ? `<p class="detail-desc">${escHtml(recipe.description)}</p>` : ''}
    </div>
    
    ${metaItems.length ? `
      <div class="detail-meta-grid">
        ${metaItems.map(item => `
          <div class="detail-meta-item">
            <div class="detail-meta-label">${escHtml(item.label)}</div>
            <div class="detail-meta-value">${escHtml(item.value)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    <div class="detail-actions">
      <button class="detail-fav-btn ${isFav ? 'active' : ''}" id="detailFavBtn" data-id="${recipe.id}">
        <span class="fav-icon">${isFav ? '♥' : '♡'}</span>
        <span>${isFav ? 'Saved' : 'Save recipe'}</span>
      </button>
      ${recipe.source ? `
        <span class="detail-source">
          <a href="${escHtml(recipe.source)}" target="_blank" rel="noopener">Original source ↗</a>
        </span>
      ` : ''}
    </div>
    
    <div class="recipe-content">${rendered}</div>
  `;
  
  // Wire fav button
  const favBtn = document.getElementById('detailFavBtn');
  favBtn.addEventListener('click', () => {
    const id = favBtn.dataset.id;
    toggleFavorite(id);
    const nowFav = favorites.has(id);
    favBtn.classList.toggle('active', nowFav);
    favBtn.querySelector('.fav-icon').textContent = nowFav ? '♥' : '♡';
    favBtn.querySelector('span:last-child').textContent = nowFav ? 'Saved to favorites' : 'Save to favorites';
  });
  
  // Set page title
  document.title = `${recipe.title} — Nick's Kitchen`;
}

function showList() {
  document.getElementById('listView').style.display = 'block';
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('printBtn').style.display = 'none';
  document.title = "Nick's Kitchen";
  
  // Re-render in case favorites changed
  applyFilters();
}

// ── Favorites ──────────────────────────────────────────
function toggleFavorite(id) {
  if (favorites.has(id)) {
    favorites.delete(id);
  } else {
    favorites.add(id);
  }
  localStorage.setItem('ns-favorites', JSON.stringify([...favorites]));
  updateFavCount();
}

function updateFavCount() {
  const count = favorites.size;
  const el = document.getElementById('favCount');
  if (count > 0) {
    el.textContent = count > 9 ? '9+' : count;
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

// ── Utils ──────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Make clearSearch globally accessible (used in HTML)
window.clearSearch = clearSearch;

// ── Weekly Plan ────────────────────────────────────────
async function loadWeeklyPlan() {
  const section = document.getElementById('weeklySection');
  const grid = document.getElementById('weeklyGrid');
  if (!section || !grid) return;

  let plan;
  try {
    const res = await fetch('data/weekly-plan.json?v=' + Date.now());
    if (!res.ok) return; // Silently skip if missing
    plan = await res.json();
  } catch (e) {
    return; // No weekly plan file — that's fine
  }

  const meals = (plan.meals || []).filter(m => m.title);
  if (meals.length === 0) return;

  // Build date label: "Mar 16 – Mar 22"
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  grid.innerHTML = meals.map(meal => {
    const hasLink = meal.recipeSlug && allRecipes.find(r => r.id === meal.recipeSlug);
    const linkedClass = hasLink ? ' is-linked' : '';
    const cookedClass = meal.cooked ? ' is-cooked' : '';
    const clickAttr = hasLink ? `onclick="window.location.hash='recipe/${escHtml(meal.recipeSlug)}'"` : '';

    return `
      <div class="meal-card${linkedClass}${cookedClass}" ${clickAttr}>
        <div class="meal-date">${escHtml(meal.day || fmtDate(meal.date))}</div>
        <span class="meal-emoji">${meal.emoji || '🍽️'}</span>
        <div class="meal-title">${escHtml(meal.title)}</div>
        ${meal.description ? `<div class="meal-desc">${escHtml(meal.description)}</div>` : ''}
        ${hasLink ? `<div class="meal-link-hint">View recipe →</div>` : ''}
      </div>
    `;
  }).join('');

  section.style.display = '';
}

// ── Go! ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
