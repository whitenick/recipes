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

// ── OG Meta Tag Helper ──────────────────────────────────────
function setOgMeta(property, content) {
  let el = document.querySelector(`meta[property=\"${property}\"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// ── Init ───────────────────────────────────────────────"}]
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
  updateGroceryBadge();
  loadFeaturedRecipes();
  
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
    const recipe = allRecipes.find(r => r.id === id);
    
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-fav')) return;
      if (e.target.closest('.grocery-add-btn')) return;
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
    
    // Grocery add button
    const groceryBtn = card.querySelector('.grocery-add-btn');
    if (groceryBtn) {
      groceryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof toggleRecipeSelection === 'function') {
          const wasSelected = selectedRecipeIds.has(id);
          toggleRecipeSelection(id);
          const isNowSelected = selectedRecipeIds.has(id);
          
          // Update button state
          groceryBtn.classList.toggle('selected', isNowSelected);
          groceryBtn.setAttribute('aria-pressed', isNowSelected);
          groceryBtn.querySelector('.grocery-btn-icon').textContent = isNowSelected ? '✓' : '🛒';
          groceryBtn.querySelector('.grocery-btn-text').textContent = isNowSelected ? 'Added to List' : 'Add to Grocery List';
          
          // Show toast
          const recipeName = recipe ? recipe.title : 'Recipe';
          showGroceryToast(recipeName, isNowSelected);
        }
      });
    }
  });
}

function renderCard(recipe, index) {
  const isFav = favorites.has(recipe.id);
  const isSelected = typeof selectedRecipeIds !== 'undefined' && selectedRecipeIds.has(recipe.id);
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
      <button class="grocery-add-btn ${isSelected ? 'selected' : ''}" 
              aria-label="${isSelected ? 'Remove from' : 'Add to'} grocery list: ${escHtml(recipe.title)}"
              aria-pressed="${isSelected}">
        <span class="grocery-btn-icon">${isSelected ? '✓' : '🛒'}</span>
        <span class="grocery-btn-text">${isSelected ? 'Added to List' : 'Add to Grocery List'}</span>
      </button>
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
  
  // Set page title and OG tags
  document.title = `${recipe.title} — Nick's Kitchen`;
  setOgMeta('og:title', `${recipe.title} — Nick's Kitchen`);
  setOgMeta('og:description', recipe.description ? recipe.description.substring(0, 200) : 'A recipe from Nick\'s Kitchen');
  setOgMeta('og:url', `https://whitenick.github.io/recipes/#recipe/${recipe.id}`);
}

function showList() {
  document.getElementById('listView').style.display = 'block';
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('printBtn').style.display = 'none';
  document.title = "Nick's Kitchen";
  setOgMeta('og:title', "Nick's Kitchen");
  setOgMeta('og:description', 'A personal collection of recipes — tested, refined, and kept.');
  setOgMeta('og:url', 'https://whitenick.github.io/recipes/');
  
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

function updateGroceryBadge() {
  const badge = document.getElementById('groceryBadge');
  if (badge && typeof selectedRecipeIds !== 'undefined') {
    const count = selectedRecipeIds.size;
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.toggle('visible', count > 0);
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

// ── Featured Recipes ───────────────────────────────────
async function loadFeaturedRecipes() {
  const section = document.getElementById('featuredSection');
  const grid = document.getElementById('featuredGrid');
  const titleEl = document.getElementById('featuredTitle');
  const subtitleEl = document.getElementById('featuredSubtitle');
  if (!section || !grid) return;

  let featured;
  try {
    const res = await fetch('data/featured.json?v=' + Date.now());
    if (!res.ok) return;
    featured = await res.json();
  } catch (e) {
    return; // No featured file — that's fine
  }

  const recipeIds = featured.recipes || [];
  if (recipeIds.length === 0) return;

  // Update title/subtitle if provided
  if (titleEl && featured.title) titleEl.textContent = featured.title;
  if (subtitleEl && featured.subtitle) subtitleEl.textContent = featured.subtitle;

  // Find matching recipes
  const featuredRecipes = recipeIds
    .map(id => allRecipes.find(r => r.id === id))
    .filter(Boolean)
    .slice(0, 6); // Max 6 featured

  if (featuredRecipes.length === 0) return;

  grid.innerHTML = featuredRecipes.map(recipe => {
    const tags = recipe.categories.slice(0, 2);
    return `
      <div class="featured-card" onclick="window.location.hash='recipe/${escHtml(recipe.id)}'">
        <div class="featured-card-badge">Featured</div>
        <div class="featured-card-title">${escHtml(recipe.title)}</div>
        ${recipe.description ? `<div class="featured-card-desc">${escHtml(recipe.description.substring(0, 100))}${recipe.description.length > 100 ? '…' : ''}</div>` : ''}
        <div class="featured-card-meta">
          ${recipe.meta.totalTime ? `<span>${escHtml(recipe.meta.totalTime)}</span>` : ''}
          ${tags.map(t => `<span class="tag ${tagClass(t)}">${escHtml(t)}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');

  section.style.display = '';
  
  // Setup collapsible functionality
  setupFeaturedCollapse(section);
}

function setupFeaturedCollapse(section) {
  const toggle = document.getElementById('featuredToggle');
  const content = document.getElementById('featuredContent');
  if (!toggle || !content) return;
  
  // Restore state from localStorage (default: expanded)
  const isCollapsed = localStorage.getItem('ns-featured-collapsed') === 'true';
  if (isCollapsed) {
    section.classList.add('collapsed');
    toggle.setAttribute('aria-expanded', 'false');
  }
  
  // Toggle handler
  const handleToggle = () => {
    const collapsed = section.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', !collapsed);
    localStorage.setItem('ns-featured-collapsed', collapsed);
  };
  
  toggle.addEventListener('click', handleToggle);
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  });
}

// ── Toast Notifications ───────────────────────────────
let toastTimeout = null;

function showGroceryToast(recipeName, added) {
  let toast = document.getElementById('groceryToast');
  
  // Create toast if it doesn't exist
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'groceryToast';
    toast.className = 'grocery-toast';
    toast.innerHTML = `
      <span class="toast-icon">✓</span>
      <span class="toast-message"></span>
    `;
    document.body.appendChild(toast);
  }
  
  // Update toast content
  const icon = added ? '✓' : '−';
  const action = added ? 'Added' : 'Removed';
  toast.querySelector('.toast-icon').textContent = icon;
  toast.querySelector('.toast-message').innerHTML = `${action} <strong>${escHtml(recipeName)}</strong> ${added ? 'to' : 'from'} grocery list`;
  toast.classList.toggle('remove', !added);
  
  // Clear any existing timeout
  if (toastTimeout) clearTimeout(toastTimeout);
  
  // Show toast
  toast.classList.add('show');
  
  // Hide after 2 seconds
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// ── Go! ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
