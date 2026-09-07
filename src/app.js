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
  
  // Wire up events
  const searchInput = document.getElementById('searchInput');
  const backBtn = document.getElementById('backBtn');
  const favoritesToggle = document.getElementById('favoritesToggle');

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim();
    applyFilters();
  });
  
  // Search badge clicks
  document.querySelectorAll('.search-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const facet = badge.dataset.facet;
      badge.classList.toggle('active');
      // Map facet to search term or category
      const facetMap = {
        'quick': 'quick',
        'healthy': 'healthy',
        'sandwich': 'sandwich',
        'under30': '',
        'salad': '',
        'meat': 'meat'
      };
      if (facet === 'under30') {
        // Quick filter for under 30 min
        currentSearch = '';
        applyFilters();
      } else if (facet === 'salad') {
        setCategory('Salads');
      } else {
        // Toggle search term
        const term = facetMap[facet] || facet;
        if (badge.classList.contains('active')) {
          currentSearch = term;
          searchInput.value = term;
        } else {
          currentSearch = '';
          searchInput.value = '';
        }
        applyFilters();
      }
    });
  });
  
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

// ── Category Chips + Sidebar + Mobile Filters ──────────
function buildCategoryChips() {
  const allCategories = new Set();
  allRecipes.forEach(r => r.categories.forEach(c => allCategories.add(c)));
  
  const sorted = [...allCategories].sort();
  
  // Desktop sidebar — add "Recent Recipes" as first pseudo-category
  const sidebar = document.getElementById('categorySidebar');
  
  // Remove the default "All" that's in the HTML — we'll add it back sorted
  const existingAll = sidebar.querySelector('[data-category=""]');
  if (existingAll) existingAll.remove();
  
  // Add "Recent Recipes" as first item
  const recentDiv = document.createElement('div');
  recentDiv.className = 'sidebar-cat';
  recentDiv.dataset.category = '__recent__';
  recentDiv.textContent = 'Recent Recipes';
  recentDiv.addEventListener('click', () => setCategory('__recent__'));
  sidebar.appendChild(recentDiv);
  
  // Add "All"
  const allDiv = document.createElement('div');
  allDiv.className = 'sidebar-cat';
  allDiv.dataset.category = '';
  allDiv.textContent = 'All';
  allDiv.addEventListener('click', () => setCategory(''));
  sidebar.appendChild(allDiv);
  
  // Add real categories
  sorted.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'sidebar-cat';
    div.dataset.category = cat;
    div.textContent = cat;
    div.addEventListener('click', () => setCategory(cat));
    sidebar.appendChild(div);
  });
  
  // Mobile filters — same structure
  const mobileContainer = document.getElementById('mobileFilters');
  // Clear existing "All"
  mobileContainer.innerHTML = '';
  
  const recentSpan = document.createElement('span');
  recentSpan.className = 'mobile-filter-chip';
  recentSpan.dataset.category = '__recent__';
  recentSpan.textContent = 'Recent Recipes';
  recentSpan.addEventListener('click', () => setCategory('__recent__'));
  mobileContainer.appendChild(recentSpan);
  
  const allSpan = document.createElement('span');
  allSpan.className = 'mobile-filter-chip';
  allSpan.dataset.category = '';
  allSpan.textContent = 'All';
  allSpan.addEventListener('click', () => setCategory(''));
  mobileContainer.appendChild(allSpan);
  
  sorted.forEach(cat => {
    const span = document.createElement('span');
    span.className = 'mobile-filter-chip';
    span.dataset.category = cat;
    span.textContent = cat;
    span.addEventListener('click', () => setCategory(cat));
    mobileContainer.appendChild(span);
  });
  
  const sidebarCount = document.getElementById('sidebarCount');
  if (sidebarCount) sidebarCount.textContent = `${allRecipes.length} recipes`;
  
  // Default to Recent Recipes
  setCategory('__recent__');
}

function setCategory(cat) {
  currentCategory = cat;
  
  // Update sidebar
  document.querySelectorAll('.sidebar-cat').forEach(el => {
    el.classList.toggle('active', el.dataset.category === cat);
  });
  
  // Update mobile filters
  document.querySelectorAll('.mobile-filter-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.category === cat);
  });
  
  // Update section header
  const titleEl = document.getElementById('sectionTitle');
  const descEl = document.getElementById('sectionDesc');
  if (titleEl) {
    if (cat === '__recent__') {
      titleEl.textContent = 'Recent Recipes';
    } else {
      titleEl.textContent = cat || 'All Recipes';
    }
  }
  if (descEl) {
    const descs = {
      '__recent__': 'Fresh from the collection',
      'Chicken': 'Poultry perfected',
      'Beef': 'From the grill and stovetop',
      'Pasta': 'Noodles and sauces',
      'Soups': 'Warm bowls',
      'Seafood': 'From the water',
      'Salads': 'Fresh and bright',
      'Vegetarian': 'Plant-forward dishes',
      'Breakfast': 'Morning meals',
      'Baking': 'Oven projects',
    };
    descEl.textContent = descs[cat] || 'Fresh from the collection';
  }
  
  applyFilters();
}

// ── Filtering / Search ─────────────────────────────────
function applyFilters() {
  const query = currentSearch.toLowerCase();
  
  filteredRecipes = allRecipes.filter(recipe => {
    // Favorites filter
    if (favoritesOnly && !favorites.has(recipe.id)) return false;
    
    // Category filter — skip for __recent__ (show all, sorted by date)
    if (currentCategory && currentCategory !== '__recent__' && !recipe.categories.includes(currentCategory)) return false;
    
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
  
  // Sort by dateAdded descending for Recent Recipes
  if (currentCategory === '__recent__') {
    filteredRecipes.sort((a, b) => {
      const da = a.dateAdded ? new Date(a.dateAdded) : new Date(0);
      const db = b.dateAdded ? new Date(b.dateAdded) : new Date(0);
      return db - da;
    });
  }
  
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
  
  // Attach click to navigate to detail view
  grid.querySelectorAll('.recipe-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', () => {
      window.location.hash = `recipe/${id}`;
    });
    
    // Save button click (stop propagation)
    const saveBtn = card.querySelector('.recipe-card-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(id);
        const isFav = favorites.has(id);
        saveBtn.textContent = isFav ? '♥' : '♡';
      });
    }
  });
}

// ── Emoji + Color Maps ────────────────────────────────
const categoryEmoji = {
  'Appetizers': '🥟',
  'Baking': '🍞',
  'Beef': '🥩',
  'Breakfast': '🍳',
  'Chicken': '🍗',
  'Desserts': '🍰',
  'Lamb': '🍖',
  'One-Pan': '🍳',
  'Other': '🍽️',
  'Pasta': '🍝',
  'Pork': '🥓',
  'Quick & Easy': '⚡',
  'Salads': '🥗',
  'Sauces & Condiments': '🧂',
  'Seafood': '🐟',
  'Soups & Stews': '🍜',
  'Vegetarian': '🥦',
};

const categoryColors = {
  'Appetizers': '#C8A87C',
  'Baking': '#C8A87C',
  'Beef': '#BD6B35',
  'Breakfast': '#E8C872',
  'Chicken': '#D4893B',
  'Desserts': '#C8A87C',
  'Lamb': '#BD6B35',
  'One-Pan': '#6A7C48',
  'Other': '#A9927A',
  'Pasta': '#E8C872',
  'Pork': '#BD6B35',
  'Quick & Easy': '#6A7C48',
  'Salads': '#7EA67A',
  'Sauces & Condiments': '#A9927A',
  'Seafood': '#6B9EB0',
  'Soups & Stews': '#D4893B',
  'Vegetarian': '#7EA67A',
};

function getCardEmoji(recipe) {
  const primary = recipe.categories && recipe.categories[0];
  return categoryEmoji[primary] || '🍽️';
}

function getCardColor(recipe) {
  const primary = recipe.categories && recipe.categories[0];
  return categoryColors[primary] || '#A9927A';
}

function renderCard(recipe, index) {
  const emoji = getCardEmoji(recipe);
  const time = recipe.meta.totalTime || recipe.meta.cookTime || '';
  const isFav = favorites.has(recipe.id);
  // Clean description: strip metadata lines, trim, limit to ~48 chars
  let desc = '';
  if (recipe.description) {
    desc = recipe.description
      .replace(/^- \*\*[^*]+\*\*:.*$/gm, '')  // Strip "- **Meta**: value" lines
      .replace(/^\d+ \w+.*$/m, '')             // Strip "45 mins Cook Time" artifacts
      .replace(/\[Title\]/gi, '')               // Strip [Title] placeholders
      .trim();
    if (desc.length > 48) desc = desc.substring(0, 45) + '…';
  }
  
  return `
    <div class="recipe-card" data-id="${recipe.id}">
      <div class="recipe-card-title">${escHtml(recipe.title)}</div>
      ${desc ? `<div class="recipe-card-desc">${escHtml(desc)}</div>` : ''}
      <button class="recipe-card-save">${isFav ? '♥' : '♡'}</button>
      <div class="recipe-card-image-wrap">
        <div class="recipe-card-image-inner">${emoji}</div>
      </div>
      <div class="recipe-card-attribution">${time ? `⏱ ${escHtml(time)}` : ''}</div>
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

// ── Go! ────────────────────────────────────────────────
// ── Go! ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
