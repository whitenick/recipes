/**
 * Nick's Kitchen — Grocery List Feature
 * Smart ingredient combining and store section organization
 */

// ── Store Sections ─────────────────────────────────────
const STORE_SECTIONS = {
  produce: {
    name: 'Produce',
    emoji: '🥬',
    keywords: [
      'lettuce', 'spinach', 'kale', 'arugula', 'greens', 'cabbage', 'chard',
      'onion', 'garlic', 'shallot', 'leek', 'scallion', 'chive',
      'tomato', 'pepper', 'bell pepper', 'jalapeño', 'chili', 'chile',
      'cucumber', 'zucchini', 'squash', 'eggplant', 'asparagus',
      'carrot', 'celery', 'potato', 'sweet potato', 'beet', 'turnip', 'radish',
      'broccoli', 'cauliflower', 'brussels', 'artichoke',
      'mushroom', 'shiitake', 'cremini', 'portobello',
      'lemon', 'lime', 'orange', 'grapefruit', 'apple', 'pear', 'banana',
      'avocado', 'mango', 'pineapple', 'berries', 'strawberry', 'blueberry',
      'ginger', 'cilantro', 'parsley', 'basil', 'mint', 'thyme', 'rosemary',
      'dill', 'oregano', 'sage', 'tarragon', 'chervil', 'bay leaf',
      'fresh herb', 'fresh produce', 'vegetable', 'fruit', 'salad'
    ]
  },
  protein: {
    name: 'Meat & Seafood',
    emoji: '🥩',
    keywords: [
      'chicken', 'beef', 'pork', 'lamb', 'veal', 'turkey', 'duck',
      'steak', 'ground beef', 'ground pork', 'ground turkey', 'ground chicken',
      'bacon', 'sausage', 'chorizo', 'pancetta', 'prosciutto', 'ham',
      'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'trout', 'bass',
      'shrimp', 'prawns', 'lobster', 'crab', 'scallop', 'mussel', 'clam',
      'fish', 'seafood', 'anchov', 'sardine', 'calamari', 'squid', 'octopus',
      'tenderloin', 'loin', 'rib', 'chop', 'thigh', 'breast', 'wing',
      'bone-in', 'boneless', 'skinless'
    ]
  },
  dairy: {
    name: 'Dairy & Eggs',
    emoji: '🧀',
    keywords: [
      'milk', 'cream', 'half-and-half', 'half and half', 'buttermilk',
      'butter', 'margarine', 'ghee',
      'cheese', 'cheddar', 'mozzarella', 'parmesan', 'parmigiano', 'pecorino',
      'feta', 'goat cheese', 'ricotta', 'mascarpone', 'brie', 'gruyere',
      'cream cheese', 'sour cream', 'crème fraîche', 'creme fraiche',
      'yogurt', 'greek yogurt', 'kefir',
      'egg', 'eggs', 'egg white', 'egg yolk'
    ]
  },
  bakery: {
    name: 'Bakery & Bread',
    emoji: '🥖',
    keywords: [
      'bread', 'baguette', 'ciabatta', 'sourdough', 'focaccia', 'pita',
      'tortilla', 'wrap', 'flatbread', 'naan',
      'roll', 'bun', 'croissant', 'brioche', 'english muffin',
      'bagel', 'crouton', 'breadcrumb', 'panko'
    ]
  },
  pantry: {
    name: 'Pantry',
    emoji: '🫙',
    keywords: [
      'flour', 'sugar', 'brown sugar', 'powdered sugar', 'honey', 'maple syrup',
      'olive oil', 'vegetable oil', 'canola oil', 'sesame oil', 'coconut oil',
      'vinegar', 'balsamic', 'red wine vinegar', 'white wine vinegar', 'rice vinegar',
      'soy sauce', 'fish sauce', 'worcestershire', 'hot sauce', 'sriracha',
      'tomato paste', 'tomato sauce', 'canned tomato', 'diced tomato', 'crushed tomato',
      'broth', 'stock', 'bouillon', 'chicken broth', 'beef broth', 'vegetable broth',
      'pasta', 'spaghetti', 'penne', 'rigatoni', 'linguine', 'fettuccine', 'noodle',
      'rice', 'arborio', 'basmati', 'jasmine', 'quinoa', 'couscous', 'bulgur',
      'beans', 'black beans', 'chickpea', 'lentil', 'white beans', 'cannellini',
      'nut', 'almond', 'walnut', 'pecan', 'pine nut', 'cashew', 'peanut',
      'coconut milk', 'coconut cream', 'condensed milk', 'evaporated milk',
      'mayonnaise', 'mustard', 'dijon', 'ketchup', 'relish',
      'capers', 'olives', 'sun-dried tomato', 'roasted pepper', 'artichoke heart',
      'cornstarch', 'baking powder', 'baking soda', 'yeast', 'gelatin',
      'vanilla', 'extract', 'cocoa', 'chocolate', 'chips'
    ]
  },
  spices: {
    name: 'Spices & Seasonings',
    emoji: '🧂',
    keywords: [
      'salt', 'pepper', 'black pepper', 'white pepper', 'cayenne',
      'paprika', 'smoked paprika', 'cumin', 'coriander', 'turmeric',
      'cinnamon', 'nutmeg', 'clove', 'allspice', 'cardamom', 'ginger powder',
      'chili powder', 'red pepper flake', 'crushed red pepper',
      'oregano dried', 'thyme dried', 'basil dried', 'rosemary dried',
      'bay leaves', 'italian seasoning', 'herbs de provence', 'za\'atar',
      'curry powder', 'garam masala', 'five spice', 'old bay',
      'garlic powder', 'onion powder', 'seasoning', 'spice'
    ]
  },
  frozen: {
    name: 'Frozen',
    emoji: '🧊',
    keywords: [
      'frozen', 'ice cream', 'frozen vegetable', 'frozen fruit',
      'frozen peas', 'frozen corn', 'frozen spinach', 'frozen berries',
      'puff pastry', 'phyllo', 'pie crust', 'pizza dough'
    ]
  },
  beverages: {
    name: 'Beverages & Wine',
    emoji: '🍷',
    keywords: [
      'wine', 'white wine', 'red wine', 'cooking wine', 'sherry', 'marsala',
      'beer', 'vodka', 'rum', 'bourbon', 'whiskey', 'brandy', 'cognac',
      'juice', 'orange juice', 'lemon juice', 'lime juice',
      'coffee', 'tea', 'espresso'
    ]
  }
};

// ── Unit Conversions ───────────────────────────────────
const UNIT_CONVERSIONS = {
  // Volume
  'tsp': { base: 'tsp', factor: 1 },
  'teaspoon': { base: 'tsp', factor: 1 },
  'teaspoons': { base: 'tsp', factor: 1 },
  'tbsp': { base: 'tsp', factor: 3 },
  'tablespoon': { base: 'tsp', factor: 3 },
  'tablespoons': { base: 'tsp', factor: 3 },
  'cup': { base: 'cup', factor: 1 },
  'cups': { base: 'cup', factor: 1 },
  'c': { base: 'cup', factor: 1 },
  'oz': { base: 'oz', factor: 1 },
  'ounce': { base: 'oz', factor: 1 },
  'ounces': { base: 'oz', factor: 1 },
  'fl oz': { base: 'oz', factor: 1 },
  'ml': { base: 'ml', factor: 1 },
  'milliliter': { base: 'ml', factor: 1 },
  'milliliters': { base: 'ml', factor: 1 },
  'l': { base: 'ml', factor: 1000 },
  'liter': { base: 'ml', factor: 1000 },
  'liters': { base: 'ml', factor: 1000 },
  'quart': { base: 'cup', factor: 4 },
  'quarts': { base: 'cup', factor: 4 },
  'pint': { base: 'cup', factor: 2 },
  'pints': { base: 'cup', factor: 2 },
  'gallon': { base: 'cup', factor: 16 },
  'gallons': { base: 'cup', factor: 16 },
  
  // Weight
  'lb': { base: 'lb', factor: 1 },
  'lbs': { base: 'lb', factor: 1 },
  'pound': { base: 'lb', factor: 1 },
  'pounds': { base: 'lb', factor: 1 },
  'g': { base: 'g', factor: 1 },
  'gram': { base: 'g', factor: 1 },
  'grams': { base: 'g', factor: 1 },
  'kg': { base: 'g', factor: 1000 },
  'kilogram': { base: 'g', factor: 1000 },
  'kilograms': { base: 'g', factor: 1000 },
  
  // Count
  'clove': { base: 'clove', factor: 1 },
  'cloves': { base: 'clove', factor: 1 },
  'can': { base: 'can', factor: 1 },
  'cans': { base: 'can', factor: 1 },
  'jar': { base: 'jar', factor: 1 },
  'jars': { base: 'jar', factor: 1 },
  'bunch': { base: 'bunch', factor: 1 },
  'bunches': { base: 'bunch', factor: 1 },
  'head': { base: 'head', factor: 1 },
  'heads': { base: 'head', factor: 1 },
  'sprig': { base: 'sprig', factor: 1 },
  'sprigs': { base: 'sprig', factor: 1 },
  'slice': { base: 'slice', factor: 1 },
  'slices': { base: 'slice', factor: 1 },
  'piece': { base: 'piece', factor: 1 },
  'pieces': { base: 'piece', factor: 1 },
  'stick': { base: 'stick', factor: 1 },
  'sticks': { base: 'stick', factor: 1 },
  'package': { base: 'package', factor: 1 },
  'packages': { base: 'package', factor: 1 },
  'pkg': { base: 'package', factor: 1 },
  'pinch': { base: 'pinch', factor: 1 },
  'pinches': { base: 'pinch', factor: 1 },
  'dash': { base: 'dash', factor: 1 },
  'dashes': { base: 'dash', factor: 1 },
  
  // Dimensionless but numeric
  'large': { base: '', factor: 1, prefix: 'large' },
  'medium': { base: '', factor: 1, prefix: 'medium' },
  'small': { base: '', factor: 1, prefix: 'small' }
};

// ── State ──────────────────────────────────────────────
let selectedRecipeIds = new Set(JSON.parse(localStorage.getItem('ns-grocery-selection') || '[]'));
let groceryList = [];
let groceryPanelOpen = false;

// ── Parse ingredient line ──────────────────────────────
function parseIngredient(line) {
  // Clean up the line
  let text = line
    .replace(/\*\*/g, '')           // Remove bold
    .replace(/\[.*?\]/g, '')        // Remove links
    .replace(/\(.*?\)/g, '')        // Remove parenthetical notes
    .replace(/,\s*(divided|plus more|to taste|optional|for serving|for garnish).*/i, '')
    .replace(/—.*$/, '')            // Remove dash notes
    .trim();
  
  if (!text || text.length < 2) return null;
  
  // Match patterns like "2 cups flour" or "1/2 lb chicken" or "3-4 medium onions"
  // Also handles fractions like ½, ¼, ¾
  const quantityRegex = /^(\d+[\s-]*\d*\/?\d*|[\u00BC-\u00BE\u2150-\u215E]+|\d+\.?\d*)\s*([\u00BC-\u00BE\u2150-\u215E]*)\s*/;
  const match = text.match(quantityRegex);
  
  let quantity = null;
  let remaining = text;
  
  if (match) {
    const numStr = (match[1] + ' ' + (match[2] || '')).trim();
    quantity = parseQuantity(numStr);
    remaining = text.slice(match[0].length).trim();
  }
  
  // Now try to extract unit
  let unit = null;
  const unitRegex = /^(tsp|teaspoons?|tbsp|tablespoons?|cups?|oz|ounces?|fl oz|ml|milliliters?|l|liters?|quarts?|pints?|gallons?|lbs?|pounds?|g|grams?|kg|kilograms?|cloves?|cans?|jars?|bunch(?:es)?|heads?|sprigs?|slices?|pieces?|sticks?|packages?|pkg|pinch(?:es)?|dash(?:es)?|large|medium|small)\b/i;
  const unitMatch = remaining.match(unitRegex);
  
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    remaining = remaining.slice(unitMatch[0].length).trim();
  }
  
  // Clean up the ingredient name
  let name = remaining
    .replace(/^of\s+/i, '')
    .replace(/^the\s+/i, '')
    .trim()
    .toLowerCase();
  
  // Skip if name is too short or looks like a note
  if (!name || name.length < 2) return null;
  if (/^(or|and|with|to|for)\s/i.test(name)) return null;
  
  return { quantity, unit, name, original: line };
}

// ── Parse quantity string to number ────────────────────
function parseQuantity(str) {
  if (!str) return null;
  
  // Handle unicode fractions
  const fractionMap = {
    '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.333, '⅔': 0.667,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
  };
  
  // Replace unicode fractions
  for (const [frac, val] of Object.entries(fractionMap)) {
    str = str.replace(frac, ` ${val}`);
  }
  
  // Handle ranges like "3-4" → take the higher number
  if (str.includes('-')) {
    const parts = str.split('-');
    str = parts[parts.length - 1].trim();
  }
  
  // Handle fractions like "1/2"
  if (str.includes('/')) {
    const parts = str.split(/\s+/);
    let total = 0;
    for (const part of parts) {
      if (part.includes('/')) {
        const [num, denom] = part.split('/');
        total += parseFloat(num) / parseFloat(denom);
      } else if (part) {
        total += parseFloat(part) || 0;
      }
    }
    return total || null;
  }
  
  // Handle "1 1/2" style (whole number + fraction)
  const parts = str.trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    total += parseFloat(part) || 0;
  }
  
  return total || null;
}

// ── Normalize ingredient name for matching ─────────────
function normalizeIngredientName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')    // Remove punctuation
    .replace(/\s+/g, ' ')            // Normalize spaces
    .replace(/\b(fresh|dried|ground|minced|chopped|diced|sliced|crushed|grated|shredded|whole|raw|cooked)\b/g, '')
    .trim();
}

// ── Categorize ingredient into store section ───────────
function categorizeIngredient(name) {
  const nameLower = name.toLowerCase();
  
  for (const [sectionId, section] of Object.entries(STORE_SECTIONS)) {
    for (const keyword of section.keywords) {
      if (nameLower.includes(keyword)) {
        return sectionId;
      }
    }
  }
  
  return 'pantry'; // Default to pantry
}

// ── Combine quantities ─────────────────────────────────
function combineQuantities(items) {
  // Group by compatible units
  const byUnit = {};
  
  for (const item of items) {
    const unitInfo = item.unit ? UNIT_CONVERSIONS[item.unit.toLowerCase()] : null;
    const baseUnit = unitInfo ? unitInfo.base : (item.unit || '');
    const key = baseUnit || 'count';
    
    if (!byUnit[key]) byUnit[key] = [];
    
    const normalizedQty = item.quantity && unitInfo 
      ? item.quantity * unitInfo.factor 
      : item.quantity;
    
    byUnit[key].push({
      ...item,
      normalizedQty,
      baseUnit: unitInfo?.base || item.unit
    });
  }
  
  // Combine within each unit group
  const results = [];
  
  for (const [baseUnit, unitItems] of Object.entries(byUnit)) {
    if (baseUnit === 'count' || !unitItems[0].normalizedQty) {
      // Can't combine, just list them
      for (const item of unitItems) {
        results.push(formatIngredient(item));
      }
    } else {
      // Sum the quantities
      const totalQty = unitItems.reduce((sum, i) => sum + (i.normalizedQty || 0), 0);
      const displayUnit = getDisplayUnit(baseUnit, totalQty);
      results.push(formatCombinedIngredient(totalQty, displayUnit, unitItems[0].name));
    }
  }
  
  return results;
}

// ── Format display unit ────────────────────────────────
function getDisplayUnit(baseUnit, qty) {
  // Convert back to friendlier units
  if (baseUnit === 'tsp' && qty >= 3) {
    return { qty: qty / 3, unit: 'tbsp' };
  }
  if (baseUnit === 'tsp' && qty >= 48) {
    return { qty: qty / 48, unit: 'cup' };
  }
  return { qty, unit: baseUnit };
}

// ── Format single ingredient for display ───────────────
function formatIngredient(item) {
  const parts = [];
  if (item.quantity) {
    parts.push(formatNumber(item.quantity));
  }
  if (item.unit) {
    parts.push(item.unit);
  }
  parts.push(item.name);
  return parts.join(' ');
}

// ── Format combined ingredient ─────────────────────────
function formatCombinedIngredient(qty, displayUnit, name) {
  const { qty: displayQty, unit } = displayUnit;
  const parts = [formatNumber(displayQty)];
  if (unit) parts.push(unit);
  parts.push(name);
  return parts.join(' ');
}

// ── Format number nicely ───────────────────────────────
function formatNumber(num) {
  if (!num) return '';
  
  // Handle common fractions
  const fractions = {
    0.25: '¼', 0.5: '½', 0.75: '¾',
    0.333: '⅓', 0.667: '⅔',
    0.125: '⅛', 0.375: '⅜', 0.625: '⅝', 0.875: '⅞'
  };
  
  const whole = Math.floor(num);
  const frac = num - whole;
  
  // Find closest fraction
  let fracStr = '';
  let minDiff = 0.1;
  for (const [val, sym] of Object.entries(fractions)) {
    const diff = Math.abs(frac - parseFloat(val));
    if (diff < minDiff) {
      minDiff = diff;
      fracStr = sym;
    }
  }
  
  if (whole && fracStr) {
    return `${whole} ${fracStr}`;
  } else if (fracStr && !whole) {
    return fracStr;
  } else if (whole) {
    return whole.toString();
  } else {
    // Just round to 1 decimal
    return Math.round(num * 10) / 10;
  }
}

// ── Build grocery list from selected recipes ───────────
function buildGroceryList(recipes) {
  const ingredientMap = new Map(); // normalized name → array of parsed ingredients
  
  for (const recipe of recipes) {
    for (const ingredientLine of recipe.ingredients) {
      const parsed = parseIngredient(ingredientLine);
      if (!parsed) continue;
      
      const normalized = normalizeIngredientName(parsed.name);
      if (!normalized) continue;
      
      if (!ingredientMap.has(normalized)) {
        ingredientMap.set(normalized, []);
      }
      ingredientMap.get(normalized).push({
        ...parsed,
        recipeName: recipe.title
      });
    }
  }
  
  // Group by store section
  const sections = {};
  
  for (const [normalized, items] of ingredientMap.entries()) {
    const displayName = items[0].name; // Use first occurrence's name
    const section = categorizeIngredient(displayName);
    
    if (!sections[section]) {
      sections[section] = [];
    }
    
    // Combine quantities if possible
    const combined = combineQuantities(items);
    sections[section].push({
      name: displayName,
      items: combined,
      recipes: [...new Set(items.map(i => i.recipeName))]
    });
  }
  
  // Sort sections and items
  const result = [];
  for (const [sectionId, sectionInfo] of Object.entries(STORE_SECTIONS)) {
    if (sections[sectionId] && sections[sectionId].length > 0) {
      result.push({
        id: sectionId,
        name: sectionInfo.name,
        emoji: sectionInfo.emoji,
        items: sections[sectionId].sort((a, b) => a.name.localeCompare(b.name))
      });
    }
  }
  
  return result;
}

// ── Selection Management ───────────────────────────────
function toggleRecipeSelection(recipeId) {
  if (selectedRecipeIds.has(recipeId)) {
    selectedRecipeIds.delete(recipeId);
  } else {
    selectedRecipeIds.add(recipeId);
  }
  saveSelection();
  updateSelectionUI();
}

function clearSelection() {
  selectedRecipeIds.clear();
  saveSelection();
  updateSelectionUI();
}

function saveSelection() {
  localStorage.setItem('ns-grocery-selection', JSON.stringify([...selectedRecipeIds]));
}

function updateSelectionUI() {
  // Update all recipe cards
  document.querySelectorAll('.recipe-card').forEach(card => {
    const id = card.dataset.id;
    const checkbox = card.querySelector('.grocery-checkbox');
    if (checkbox) {
      checkbox.classList.toggle('checked', selectedRecipeIds.has(id));
    }
  });
  
  // Update grocery button badge
  if (typeof updateGroceryBadge === 'function') {
    updateGroceryBadge();
  } else {
    const badge = document.getElementById('groceryBadge');
    if (badge) {
      const count = selectedRecipeIds.size;
      badge.textContent = count > 9 ? '9+' : count;
      badge.classList.toggle('visible', count > 0);
    }
  }
  
  // Update panel if open
  if (groceryPanelOpen) {
    renderGroceryPanel();
  }
}

// ── Render Grocery Panel ───────────────────────────────
function renderGroceryPanel() {
  const panel = document.getElementById('groceryPanel');
  const content = document.getElementById('groceryContent');
  
  if (!panel || !content) return;
  
  if (selectedRecipeIds.size === 0) {
    content.innerHTML = `
      <div class="grocery-empty">
        <div class="grocery-empty-icon">🛒</div>
        <h3>No Recipes Selected</h3>
        <p>Use the checkbox on recipe cards to add them to your grocery list.</p>
      </div>
    `;
    return;
  }
  
  // Get selected recipes
  const selectedRecipes = allRecipes.filter(r => selectedRecipeIds.has(r.id));
  groceryList = buildGroceryList(selectedRecipes);
  
  let html = `
    <div class="grocery-header-info">
      <span class="grocery-recipe-count">${selectedRecipes.length} recipe${selectedRecipes.length !== 1 ? 's' : ''}</span>
      <button class="grocery-clear-btn" onclick="clearGrocerySelection()">Clear all</button>
    </div>
    <div class="grocery-selected-recipes">
      ${selectedRecipes.map(r => `
        <div class="grocery-selected-recipe">
          <span>${escHtml(r.title)}</span>
          <button class="grocery-remove-recipe" onclick="toggleRecipeSelection('${r.id}')">×</button>
        </div>
      `).join('')}
    </div>
  `;
  
  if (groceryList.length > 0) {
    html += `<div class="grocery-sections">`;
    
    for (const section of groceryList) {
      html += `
        <div class="grocery-section">
          <div class="grocery-section-header">
            <span class="grocery-section-emoji">${section.emoji}</span>
            <span class="grocery-section-name">${section.name}</span>
            <span class="grocery-section-count">${section.items.length}</span>
          </div>
          <ul class="grocery-items">
            ${section.items.map(item => `
              <li class="grocery-item">
                <label class="grocery-item-check">
                  <input type="checkbox" class="grocery-checkbox-input">
                  <span class="grocery-item-text">${escHtml(item.items.join(' + '))}</span>
                </label>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }
    
    html += `</div>`;
  }
  
  content.innerHTML = html;
}

// ── Open/Close Panel ───────────────────────────────────
function openGroceryPanel() {
  const panel = document.getElementById('groceryPanel');
  const overlay = document.getElementById('groceryOverlay');
  if (panel && overlay) {
    panel.classList.add('open');
    overlay.classList.add('visible');
    groceryPanelOpen = true;
    renderGroceryPanel();
    document.body.style.overflow = 'hidden';
  }
}

function closeGroceryPanel() {
  const panel = document.getElementById('groceryPanel');
  const overlay = document.getElementById('groceryOverlay');
  if (panel && overlay) {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    groceryPanelOpen = false;
    document.body.style.overflow = '';
  }
}

function clearGrocerySelection() {
  clearSelection();
}

// ── Print Grocery List ─────────────────────────────────
function printGroceryList() {
  if (groceryList.length === 0) return;
  
  const selectedRecipes = allRecipes.filter(r => selectedRecipeIds.has(r.id));
  
  let printContent = `
    <html>
    <head>
      <title>Grocery List — Nick's Kitchen</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .recipes { font-size: 12px; color: #666; margin-bottom: 24px; }
        .section { margin-bottom: 24px; }
        .section-header { font-weight: 600; font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
        ul { list-style: none; padding: 0; margin: 0; }
        li { padding: 4px 0; display: flex; align-items: center; gap: 8px; }
        li::before { content: '☐'; font-size: 14px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>🛒 Grocery List</h1>
      <div class="recipes">For: ${selectedRecipes.map(r => r.title).join(', ')}</div>
  `;
  
  for (const section of groceryList) {
    printContent += `
      <div class="section">
        <div class="section-header">${section.emoji} ${section.name}</div>
        <ul>
          ${section.items.map(item => `<li>${item.items.join(' + ')}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  printContent += `</body></html>`;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

// ── Export as text ─────────────────────────────────────
function exportGroceryList() {
  if (groceryList.length === 0) return;
  
  const selectedRecipes = allRecipes.filter(r => selectedRecipeIds.has(r.id));
  
  let text = `GROCERY LIST\n`;
  text += `For: ${selectedRecipes.map(r => r.title).join(', ')}\n`;
  text += `Generated: ${new Date().toLocaleDateString()}\n\n`;
  
  for (const section of groceryList) {
    text += `═══ ${section.name.toUpperCase()} ═══\n`;
    for (const item of section.items) {
      text += `☐ ${item.items.join(' + ')}\n`;
    }
    text += '\n';
  }
  
  // Copy to clipboard
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.grocery-export-btn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = original, 2000);
    }
  });
}

// ── Escape HTML ────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Expose functions globally ──────────────────────────
window.toggleRecipeSelection = toggleRecipeSelection;
window.clearGrocerySelection = clearGrocerySelection;
window.openGroceryPanel = openGroceryPanel;
window.closeGroceryPanel = closeGroceryPanel;
window.printGroceryList = printGroceryList;
window.exportGroceryList = exportGroceryList;
window.selectedRecipeIds = selectedRecipeIds;
