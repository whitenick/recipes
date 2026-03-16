#!/usr/bin/env node

/**
 * Recipe Site Build Script
 * Reads .md files from Obsidian vault and generates recipes.json
 */

const fs = require('fs');
const path = require('path');

const RECIPES_DIR = '/home/jobin/obsidian-mac-vault/General/Personal/Culinary/Recipes';
const OUTPUT_FILE = path.join(__dirname, 'data', 'recipes.json');

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const SECTION_HEADINGS = /^(ingredients?|instructions?|notes?|yield|time|overview|description|directions|method|tips?|variations?|servings?|assembly(\s+and\s+serving)?|garnish|equipment|source|preparation|baker'?s?\s+notes?|why\s+this|timeline|serving\s+suggestions?|leftovers?|storage|nutrition|shopping\s+list|grocery|meal\s+plan)$/i;

function extractTitle(content, filename) {
  // Try to get title from first # heading that isn't a section name
  const h1Matches = [...content.matchAll(/^#\s+(.+)$/gm)];
  for (const match of h1Matches) {
    const candidate = match[1].trim().replace(/\*\*/g, '');
    if (!SECTION_HEADINGS.test(candidate)) {
      return candidate;
    }
  }
  // Fall back to filename without extension
  return filename.replace(/\.md$/, '');
}

function extractDescription(content) {
  // Try Description section
  const descMatch = content.match(/##\s+Description\s*\n+([\s\S]+?)(?=\n##|\n---|\n\*\*|$)/i);
  if (descMatch) {
    return descMatch[1].trim().replace(/\n+/g, ' ').substring(0, 300);
  }
  
  // Try Overview section
  const overviewMatch = content.match(/##\s+Overview\s*\n+([\s\S]+?)(?=\n##|\n---|\n\*\*|$)/i);
  if (overviewMatch) {
    const text = overviewMatch[1].trim().replace(/\n+/g, ' ');
    // Remove bold metadata like **Timeline:** etc.
    const clean = text.replace(/\*\*[^*]+:\*\*[^|]+\|?/g, '').trim();
    return clean.substring(0, 300);
  }
  
  // Try first non-empty, non-heading, non-source paragraph
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('Source:') && 
        !trimmed.startsWith('http') && !trimmed.startsWith('|') && !trimmed.startsWith('-') &&
        !trimmed.startsWith('*') && trimmed.length > 20) {
      return trimmed.substring(0, 300);
    }
  }
  
  return '';
}

function cleanMetaValue(val) {
  if (!val) return null;
  const v = val.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  // Reject clearly bad values
  if (/^[-_=\s]+$/.test(v)) return null;
  if (v.length > 80) return null;
  if (v.length < 1) return null;
  return v;
}

function extractMeta(content) {
  const meta = {};
  
  const patterns = [
    { key: 'prepTime', regex: /[-–]\s*\*?\*?[Pp]rep(?:aration)?\s*[Tt]ime\*?\*?:?\s*\*?\*?([^\n|*]+)/i },
    { key: 'cookTime', regex: /[-–]\s*\*?\*?[Cc]ook(?:ing)?\s*[Tt]ime\*?\*?:?\s*\*?\*?([^\n|*]+)/i },
    { key: 'totalTime', regex: /[-–]\s*\*?\*?[Tt]otal\s*[Tt]ime\*?\*?:?\s*\*?\*?([^\n|*]+)/i },
    { key: 'servings', regex: /[-–]\s*\*?\*?[Ss]erv(?:ings?|es?)\*?\*?:?\s*\*?\*?([^\n|*]+)/i },
    { key: 'yield', regex: /[-–]\s*\*?\*?[Yy]ield\*?\*?:?\s*\*?\*?([^\n|*]+)/i },
    // Inline bold format: **Prep Time**: 20 minutes
    { key: 'prepTime', regex: /\*\*[Pp]rep(?:aration)?\s*[Tt]ime\*\*:\s*([^\n|*]+)/i },
    { key: 'cookTime', regex: /\*\*[Cc]ook(?:ing)?\s*[Tt]ime\*\*:\s*([^\n|*]+)/i },
    { key: 'totalTime', regex: /\*\*[Tt]otal\s*[Tt]ime\*\*:\s*([^\n|*]+)/i },
    { key: 'servings', regex: /\*\*[Ss]erv(?:ings?|es?)\*\*:\s*([^\n|*]+)/i },
    { key: 'yield', regex: /\*\*[Yy]ield\*\*:\s*([^\n|*]+)/i },
    // Timeline in Overview
    { key: 'totalTime', regex: /\*\*Timeline:\*\*\s*([^|\n]+)/i },
    // Preparation Time: 25 minutes (no bold)
    { key: 'prepTime', regex: /\*?\*?[Pp]reparation\s*[Tt]ime\*?\*?:\s*([^\n|*]+)/i },
  ];
  
  for (const { key, regex } of patterns) {
    if (!meta[key]) {
      const match = content.match(regex);
      if (match) {
        const cleaned = cleanMetaValue(match[1]);
        if (cleaned) meta[key] = cleaned;
      }
    }
  }
  
  // Merge yield into servings if servings not found
  if (!meta.servings && meta.yield) {
    meta.servings = meta.yield;
  }
  
  return meta;
}

function detectCategories(content, title, filename, subdir = '') {
  // Normalize: replace underscores and hyphens with spaces for reliable \b matching
  const t = title.toLowerCase().replace(/[_\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const subdirLower = subdir.toLowerCase();

  // For Todd's Kitchen: extract the immediate folder name as a strong signal
  const toddFolder = (() => {
    const m = subdirLower.match(/todd's kitchen\/([^/]+)/);
    return m ? m[1] : '';
  })();

  const headersAndDesc = (() => {
    const lines = content.split('\n');
    const relevant = lines.filter(l =>
      l.startsWith('#') || l.startsWith('**') || l.startsWith('- **') || /^(A|The|This) /.test(l)
    ).join(' ');
    return (title + ' ' + relevant + ' ' + content.substring(0, 800)).toLowerCase();
  })();

  const categories = new Set();

  // ── Subdir bootstrapping (Todd's Kitchen folders) ──
  if (toddFolder === 'soup')            categories.add('Soups & Stews');
  if (toddFolder === 'bfast')           categories.add('Breakfast');
  if (toddFolder === 'desert')          categories.add('Desserts');
  if (toddFolder === 'salad')           categories.add('Salads');
  if (toddFolder === 'starters')        categories.add('Appetizers');
  if (toddFolder === 'sauces')          categories.add('Sauces & Condiments');
  if (toddFolder === 'bread')           categories.add('Baking');
  if (toddFolder === 'veggy')           categories.add('Vegetarian');
  if (toddFolder === 'pizza')           categories.add('Baking');

  // ── Proteins ──
  // Check title first; fall back to headersAndDesc for slug-style titles with no readable name

  // For protein detection: use title only for readable titles to avoid false positives
  // (e.g. "chicken broth" in a beef stew tagging it as Chicken).
  // For slug-style filenames (underscores/dots in original name), also scan the short description.
  const isSlugTitle = /[_.]/.test(title) && !/\s{2,}/.test(title);
  const proteinSrc = isSlugTitle
    ? t + ' ' + headersAndDesc.substring(0, 250)
    : t;

  // Seafood
  if (/\b(salmon|trout|cod|tuna|halibut|tilapia|sea bass|branzino|red snapper|swordfish|mahi|catfish|flounder|sole|anchov|sardine|shrimps?|prawns?|lobster|crabs?|clams?|mussels?|oysters?|scallops?|octopus|squid|calamari|seafood|bouillabaisse|cioppino|gravlax|lox|bisque|sushi|maki|temaki|tonkatsu|black cod|ceviche|crab cakes?|clam chowder|gambas|gamberi|gameri|ajillo|escargots?|paella|po boy|poboy)\b/.test(proteinSrc)) {
    categories.add('Seafood');
  }
  // Chicken (includes turkey, duck — broad poultry bucket)
  if (/\b(chicken|turkey|duck|poultry|coq au vin|tikka masala|tikka|shawarma|biryani|marsala|piccata|tetrazzini|cacciatore|kiev|katsu|yakitori)\b/.test(proteinSrc)) {
    categories.add('Chicken');
  }
  // Beef (includes veal, meatball, meatloaf)
  if (/\b(beef|steaks?|burgers?|brisket|tenderloin|chuck|veal|meatloaf|meatballs?|prime rib|côtes de boeuf|stroganoff|bourguignon|bolognese|pot roast|corned beef|bifteki|chopped steak|smash burger|t bone|ribeye|osso buco|pappardelle|ragù|ragu|short rib|arayes)\b/.test(proteinSrc)) {
    categories.add('Beef');
  }
  // Pork
  if (/\b(pork|bacons?|ham\b|prosciutto|pancetta|chorizo|sausages?|ribs?\b|pulled pork|pork chop|hot dog|coney|blt\b|cassoulet|carnitas|jambalaya|gumbo|stromboli|lardons?|croque)\b/.test(proteinSrc)) {
    categories.add('Pork');
  }
  // Lamb
  if (/\b(lamb|mutton|vindaloo|gyro|souvlaki|kofta|moussaka|shepherds? pie|lancashire|lamb chops?|lamb curry|lamb stew)\b/.test(proteinSrc)) {
    categories.add('Lamb');
  }

  // ── Dish types ──

  // Soups & Stews
  if (/\b(soup|stew|bisque|chowder|broth|congee|gazpacho|gumbo|bouillabaisse|jambalaya|posole|minestrone|ramen|pho|wonton|chili\b|hot pot|egg drop|cassoulet|pozole|consommé)\b/.test(t)) {
    categories.add('Soups & Stews');
  }
  // Pasta
  if (/\b(pasta|spaghetti|fettuccine|penne|rigatoni|linguine|tagliatelle|pappardelle|bucatini|lasagna|carbonara|amatriciana|aglio|risotto|gnocchi|ravioli|tortellini|noodle|chow mein|lo mein|pad thai|pad krapow|dan dan|macaroni|mac and cheese|mac & cheese)\b/.test(t)) {
    categories.add('Pasta');
  }
  // Salads
  if (/\b(salad|panzanella|tabbouleh|nicoise|slaw|coleslaw)\b/.test(t)) {
    categories.add('Salads');
  }
  // Baking — exclude savory pies (shepherd's, pot pie, chicken pie)
  const isSavoryPie = /\b(shepherds?|pot pie|chicken pie|meat pie|fish pie)\b/.test(t);
  if (/\b(breads?|sourdough|biscuits?|rolls?|boule|cake|cookie|pastry|muffin|tart|crêpes?|crepes?|waffle|pancake|popover|pizza dough|dough|scone|brownie|croissant|quiche lorraine|stromboli|cornbread)\b/.test(t) ||
      (!isSavoryPie && /\bpie\b/.test(t))) {
    categories.add('Baking');
  }
  // Breakfast
  if (/\b(breakfast|brunch|waffle|pancake|popover|quiche|eggs? benedict|hash\b|hash brown|omelette|omelet|scramble|frittata|casserole|avocado toast|corned beef hash)\b/.test(t) ||
      filename.toLowerCase().includes('quiche') || toddFolder === 'bfast') {
    categories.add('Breakfast');
  }
  // Desserts
  if (/\b(dessert|cheesecake|crème brûlée|creme brulee|mousse|pudding|tiramisu|panna cotta|cobbler|crisp|brownie|ice cream|gelato|sorbet|éclair|macaron|pavlova|key lime|apple pie|no.bake blueberry|blueberry cheesecake)\b/.test(t) ||
      toddFolder === 'desert') {
    categories.add('Desserts');
  }
  // Dessert-specific pies/cakes (not savory pies)
  if (!isSavoryPie && /\b(pie\b|cake\b|muffin|tart)\b/.test(t)) {
    categories.add('Desserts');
  }
  // Appetizers
  if (/\b(nachos?|bruschetta|ceviche|shishito|saganaki|spring rolls?|egg rolls?|dumplings?|dim sum|fritto misto|caprese|hummus|baba ganoush|tapenade|dolmas?|deviled|arancini|samosas?|empanada|pakora|gyoza|wonton|edamame|ritz|lox|schmear|buffalo.*dip|chicken dip|cowboy caviar|chile relleno|fondues?|escargots?|arayes|queso|con queso)\b/.test(t) ||
      toddFolder === 'starters') {
    categories.add('Appetizers');
  }
  // Sauces & Condiments
  if (/\b(sauce\b|relish|chimichurri|pesto|aioli|salsa\b|dip\b|spread|gravlax|marinade|seasoning|tapenade|chili powder|dressing|vinaigrette|rub\b|glaze|gravy|hollandaise|béarnaise|bearnaise|remoulade|tzatziki|tahini|harissa|mojo|chutney|bbq sauce|chili oil)\b/.test(t) ||
      /^(chimichurri|pepper relish|chili powder|béarnaise|bearnaise|tzatziki|italian dressing)\b/.test(t)) {
    categories.add('Sauces & Condiments');
  }
  // One-Pan / Sheet Pan / Stir-Fry
  if (/\b(sheet[\s-]pan|one[\s-]pan|one[\s-]pot|skillet\b|stir.fry|stir fry)\b/.test(t + ' ' + headersAndDesc.substring(0, 300))) {
    categories.add('One-Pan');
  }
  // Vegetarian (explicit label or known veggie dishes)
  if (/\b(vegetarian|vegan|meatless|plant.based)\b/.test(t + ' ' + headersAndDesc.substring(0, 400))) {
    categories.add('Vegetarian');
  }
  const veggieOnlyDishes = [
    'eggplant parmesan','eggplant with','zucchini','gazpacho','panzanella','three sisters',
    'congee','carrot ginger','tabbouleh','hummus','baba ganoush','ratatouille','aloo gobi',
    'palak paneer','masala dosa','paneer','caprese','margherita pizza','greek potato',
    'lemon potato','potatoes au gratin','potato au gratin','shakshuka','chakchouka','dolma',
    'briam','cauliflower','mushroom risotto','black bean','baked bean','boston baked',
    'quinoa','avocado toast','marry.me chickpea','chickpea','sauerkraut',
    'tamarind.*carrot','carrot.*tamarind','stuffed pepper','gobi','aloo',
    'red bean','greek style potato','silky truffle'
  ];
  if (veggieOnlyDishes.some(v => new RegExp(v).test(t))) {
    if (!categories.has('Seafood') && !categories.has('Chicken') && !categories.has('Beef') && !categories.has('Pork') && !categories.has('Lamb')) {
      categories.add('Vegetarian');
    }
  }
  // Quick & Easy
  if (/\b(weeknight|quick|easy|simple|30[\s-]min|fast|10 min)\b/.test(headersAndDesc.substring(0, 500))) {
    categories.add('Quick & Easy');
  }

  // If nothing matched, fall back to Other
  if (categories.size === 0) {
    categories.add('Other');
  }

  return Array.from(categories);
}

function extractIngredients(content) {
  const ingredients = [];
  
  // Strategy 1: Find the Ingredients section and extract all list items
  // We do this line-by-line to avoid regex multiline anchoring issues
  const lines = content.split('\n');
  let inIngredSection = false;
  let ingredDepth = 0; // heading depth of Ingredients section
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const heading = headingMatch[2].trim().replace(/[:\s]+$/, '');
      
      if (/^ingredients?$/i.test(heading)) {
        // Start of ingredients section
        inIngredSection = true;
        ingredDepth = depth;
        continue;
      }
      
      if (inIngredSection) {
        // Stop at another heading of same or higher level (lower depth number)
        if (depth <= ingredDepth) {
          inIngredSection = false;
        }
        // Sub-headings within ingredients section are fine - keep going
        continue;
      }
    }
    
    if (inIngredSection) {
      // Extract list items (both bullet and numbered)
      const listMatch = line.match(/^[\s]*[-*]\s+(.+)$/) || line.match(/^[\s]*\d+\.\s+(.+)$/);
      if (listMatch) {
        const clean = listMatch[1].replace(/\*\*/g, '').replace(/\[.*?\]/g, '').trim();
        if (clean && clean.length > 2 && clean.length < 200) {
          ingredients.push(clean);
        }
      }
    }
  }
  
  // Strategy 2: Table format (| Ingredient | Amount |)
  let inIngredTable = false;
  for (const line of lines) {
    if (/\|\s*[Ii]ngredient\s*\|/.test(line)) { inIngredTable = true; continue; }
    if (inIngredTable && /\|[-\s]+\|/.test(line)) continue; // separator row
    if (inIngredTable && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim());
      if (cells.length >= 2) {
        const ingredient = cells[0].trim();
        const amount = cells[1] ? cells[1].trim() : '';
        if (ingredient && ingredient.length < 100 && !/^[Ii]ngredient$/.test(ingredient)) {
          ingredients.push(amount ? `${ingredient} — ${amount}` : ingredient);
        }
      }
    } else if (inIngredTable && !line.trim().startsWith('|') && line.trim()) {
      inIngredTable = false;
    }
  }
  
  return [...new Set(ingredients)].slice(0, 60);
}

function getSource(content) {
  const sourceMatch = content.match(/Source:\s*(https?:\/\/[^\s\n]+)/i) ||
                      content.match(/^(https?:\/\/[^\s\n]+)/m);
  return sourceMatch ? sourceMatch[1].trim() : null;
}

function processRecipeFile(filePath, subdir = '') {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    const name = filename.replace(/\.md$/, '');
    
    const title = extractTitle(content, name);
    const description = extractDescription(content);
    const meta = extractMeta(content);
    const categories = detectCategories(content, title, filename, subdir);
    const ingredients = extractIngredients(content);
    const source = getSource(content);
    
    // Get active time hint from content
    let activeTime = meta.totalTime || meta.cookTime || meta.timeline || null;
    
    return {
      id: slugify(title || name),
      title: title || name,
      filename: name,
      subdir,
      description,
      categories,
      ingredients,
      meta: {
        prepTime: meta.prepTime || null,
        cookTime: meta.cookTime || null,
        totalTime: meta.totalTime || meta.timeline || null,
        servings: meta.servings || meta.yield || null,
      },
      source,
      content, // full markdown content
    };
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return null;
  }
}

// Directories and files to skip (not actual recipes)
const SKIP_DIRS = ['weekly plan', 'weekly plans', 'planning', 'notes'];
const SKIP_FILES_REGEX = /^(weekly|meal plan|shopping|planner|todo|notes|index)/i;

function collectRecipes(dir, subdir = '') {
  const recipes = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip non-recipe files
        if (SKIP_FILES_REGEX.test(entry.name)) {
          console.log(`  ⊘ Skipping: ${subdir ? subdir + '/' : ''}${entry.name}`);
          continue;
        }
        const filePath = path.join(dir, entry.name);
        const recipe = processRecipeFile(filePath, subdir);
        if (recipe) {
          console.log(`  ✓ ${subdir ? subdir + '/' : ''}${entry.name}`);
          recipes.push(recipe);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // Skip non-recipe directories
        if (SKIP_DIRS.includes(entry.name.toLowerCase())) {
          console.log(`  ⊘ Skipping dir: ${entry.name}/`);
          continue;
        }
        const subRecipes = collectRecipes(
          path.join(dir, entry.name),
          subdir ? `${subdir}/${entry.name}` : entry.name
        );
        recipes.push(...subRecipes);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
  
  return recipes;
}

console.log('🍳 Building recipe index...\n');
const recipes = collectRecipes(RECIPES_DIR);
console.log(`\n✅ Processed ${recipes.length} recipes`);

// Sort alphabetically by title
recipes.sort((a, b) => a.title.localeCompare(b.title));

// Write output
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(recipes, null, 2));
console.log(`📁 Written to ${OUTPUT_FILE}`);

// Print category summary
const allCategories = new Set();
recipes.forEach(r => r.categories.forEach(c => allCategories.add(c)));
console.log(`\n📂 Categories: ${[...allCategories].sort().join(', ')}`);
