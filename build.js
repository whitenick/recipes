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

function detectCategories(content, title, filename) {
  // Use title + first 1000 chars of content for category detection
  // This avoids false positives from ingredient lists (e.g. "chicken broth" in a beef dish)
  const titleLower = title.toLowerCase();
  const headersAndDesc = (() => {
    // Extract headings, description, and first paragraphs
    const lines = content.split('\n');
    const relevant = lines.filter(l => 
      l.startsWith('#') || 
      l.startsWith('**') || 
      l.startsWith('- **') ||
      l.match(/^(A|The|This) /)
    ).join(' ');
    return (title + ' ' + relevant + ' ' + content.substring(0, 800)).toLowerCase();
  })();
  
  const categories = new Set();
  
  // ── Primary protein (use title + headings primarily) ──
  if (/\b(salmon|trout|cod|tuna|halibut|shrimp|seafood|gravlax|miso salmon|broccoli rabe.*salmon|ajillo|gambas)\b/.test(titleLower + ' ' + headersAndDesc)) {
    categories.add('Seafood');
  }
  // Chicken: title says chicken, or dish is named after chicken
  if (/\b(chicken|poultry)\b/.test(titleLower) || 
      /^(chicken|sesame chicken|mediterranean.*chicken)\b/.test(titleLower)) {
    categories.add('Chicken');
  }
  // Beef: title or primary content 
  if (/\b(beef|steak|burger|bolognese|tenderloin|côtes de boeuf|brisket|chuck)\b/.test(titleLower) ||
      /title.*\b(beef|burger|steak)\b/.test(titleLower)) {
    categories.add('Beef');
  }
  // Pork: explicitly in title or primary content
  if (/\b(pork|bacon|ham|prosciutto|pancetta)\b/.test(titleLower)) {
    categories.add('Pork');
  }
  
  // ── Dish type (by title) ──
  if (/\b(soup|stew|congee|gazpacho|chowder|broth)\b/.test(titleLower)) {
    categories.add('Soups & Stews');
  }
  if (/\b(salad)\b/.test(titleLower)) {
    categories.add('Salads');
  }
  if (/\b(breads?|sourdough|popovers?|biscuits?|rolls?|boule|cake|cookie|pastry|muffin)\b/.test(titleLower)) {
    categories.add('Baking');
  }
  if (/\b(lasagna|pasta|noodle|bolognese)\b/.test(titleLower)) {
    categories.add('Pasta');
  }
  if (/\b(quiche|breakfast|brunch|waffle|pancake|popover)\b/.test(titleLower) ||
      filename.toLowerCase().includes('quiche')) {
    categories.add('Breakfast');
  }
  if (/\b(sauce|relish|chimichurri|pesto|aioli|salsa|dip|spread|gravlax)\b/.test(titleLower) ||
      /^(chimichurri|pepper relish)\b/.test(titleLower)) {
    categories.add('Sauces & Condiments');
  }
  if (/\b(sheet[\s-]pan|one[\s-]pan|one[\s-]pot|sheet pan)\b/.test(titleLower + ' ' + headersAndDesc.substring(0, 200))) {
    categories.add('One-Pan');
  }
  
  // ── Vegetarian (by title or if no meat detected) ──
  if (/\b(vegetarian|vegan|meatless|plant.based)\b/.test(titleLower + ' ' + headersAndDesc.substring(0, 400))) {
    categories.add('Vegetarian');
  }
  // Dishes that are clearly vegetarian by content
  const veggieOnlyDishes = ['eggplant', 'zucchini', 'gazpacho', 'panzanella', 'three sisters', 'congee', 'carrot'];
  if (veggieOnlyDishes.some(v => titleLower.includes(v))) {
    if (!categories.has('Seafood') && !categories.has('Chicken') && !categories.has('Beef') && !categories.has('Pork')) {
      categories.add('Vegetarian');
    }
  }
  
  // ── Quick & Easy ──
  if (/\b(weeknight|quick|easy|simple|30[\s-]min|fast)\b/.test(headersAndDesc.substring(0, 500))) {
    categories.add('Quick & Easy');
  }

  // If no category found
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
    const categories = detectCategories(content, title, filename);
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
