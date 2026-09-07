#!/usr/bin/env node

/**
 * Recipe Site Build Script
 * Reads .md files from Obsidian vault and generates recipes.json
 *
 * The vault directory is read from the RECIPES_DIR env var when set,
 * falling back to the historical default path.
 *
 * Normalization:
 * - title / description / meta values are scrubbed of chart-parser and
 *   site-scrape debris before being written to data/recipes.json, so the
 *   corpus stays clean for the search index (see docs/search-data-model.md).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_RECIPES_DIR = '/home/jobin/obsidian-mac-vault/General/Personal/Culinary/Recipes';
const RECIPES_DIR = process.env.RECIPES_DIR || DEFAULT_RECIPES_DIR;
const OUTPUT_FILE = path.join(__dirname, 'data', 'recipes.json');

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function collapseWs(str) {
  return str.replace(/\s+/g, ' ').trim();
}

const SECTION_HEADINGS = /^(ingredients?|mise\s+en\s+place|instructions?|notes?|yield|time|overview|description|directions|method|tips?|variations?|servings?|assembly(\s+and\s+serving)?|garnish|equipment|source|preparation|baker'?s?\s+notes?|why\s+this|timeline|serving\s+suggestions?|leftovers?|storage|nutrition|shopping\s+list|grocery|meal\s+plan)$/i;

// ── Title cleaning ───────────────────────────────────────
// Removes stray bracket/scrape debris while keeping parenthetical
// descriptions searchable (e.g. "Aloo Samosas (Potato Samosas) Recipe").
function cleanTitle(title) {
  if (!title) return '';
  let t = String(title).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  // Unwrap a title that is entirely wrapped in one bracket pair: "(Dolmas)" → "Dolmas"
  t = t.replace(/^\(([^()]*)\)$/, '$1').trim();
  t = t.replace(/^\[([^\[\]]*)\]$/, '$1').trim();
  // Strip leading/trailing stray punctuation that isn't part of a word
  t = t.replace(/^[\s\-–—.]+/, '').replace(/[\s\-–—.]+$/, '').trim();
  return t;
}

// ── Meta / duration normalization ────────────────────────

// Trailing tokens that leak from flattened scraped recipe metadata
// (e.g. "- **Prep Time**: 45 mins Cook Time").
const META_TAIL_JUNK = /(?:\s*(?:cook(?:ing)?\s*time|total(?:\s*time)?|prep(?:aration)?\s*time|active\s*time|additional\s*time|time\s*to\s*(?:stand|chill)|method|yield|servings?|serves?|serving|cuisine|category|course|stove\s*top)\b)+$/i;
const META_LEAD_JUNK = /^(?:about|approx(?:imately)?|roughly|around|prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time|active\s*time|additional\s*time)\s*:?\s*/i;

const DURATION_RE_SRC =
  // "2 days", "2 days 3 hrs", "2 days 3 hrs 20 mins"
  '(\\d+(?:\\.\\d+)?)\\s*days?\\b(?:\\s*(\\d+(?:\\.\\d+)?)\\s*(?:hours?|hrs?))?(?:\\s*(?:and\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:minutes?|mins?))?' +
  '|' +
  // "1 hr 45 mins", "2 hours"
  '(\\d+(?:\\.\\d+)?)\\s*(?:hours?|hrs?)\\b(?:\\s*(?:and\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:minutes?|mins?))?' +
  '|' +
  // "45 mins", "30 minutes"
  '(\\d+(?:\\.\\d+)?)\\s*(?:minutes?|mins?)' +
  '|' +
  // compact "45m", "2h"
  '(\\d+(?:\\.\\d+)?)\\s*[hm]\\b';

// Collect discrete duration phrases from a value.
// E.g. "1 hour 45 minutes" is one phrase (105), "5 mins 10 mins 15 mins" is three.
function collectDurationPhrases(value) {
  const s = String(value).toLowerCase();
  const phrases = [];
  const re = new RegExp(DURATION_RE_SRC, 'gi');
  let m;
  while ((m = re.exec(s))) {
    let minutes;
    if (m[1]) {
      minutes = Math.round(parseFloat(m[1]) * 1440);
      if (m[2]) minutes += Math.round(parseFloat(m[2]) * 60);
      if (m[3]) minutes += Math.round(parseFloat(m[3]));
    } else if (m[4]) {
      minutes = Math.round(parseFloat(m[4]) * 60);
      if (m[5]) minutes += Math.round(parseFloat(m[5]));
    } else if (m[6]) {
      minutes = Math.round(parseFloat(m[6]));
    } else if (m[7]) {
      minutes = Math.round(parseFloat(m[7]));
      if (/h/.test(m[0])) minutes *= 60;
    }
    phrases.push({ minutes, raw: m[0].trim() });
  }
  return phrases;
}

function canonicalDurationText(minutes) {
  const hr = Math.floor(minutes / 60);
  const min = minutes % 60;
  if (hr === 0) return `${min} ${min === 1 ? 'min' : 'mins'}`;
  if (min === 0) return `${hr} ${hr === 1 ? 'hr' : 'hrs'}`;
  return `${hr} ${hr === 1 ? 'hr' : 'hrs'} ${min} ${min === 1 ? 'min' : 'mins'}`;
}

function normalizeUnits(str) {
  return String(str).replace(
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi,
    (all, n, u) => {
      const num = parseFloat(n);
      if (/^h/i.test(u)) return `${n.trim()} ${num === 1 ? 'hr' : 'hrs'}`;
      return `${n.trim()} ${num === 1 ? 'min' : 'mins'}`;
    }
  );
}

// Clean a prep/cook/total time value: strip flattening debris, keep the
// authored text for display and derive integer minutes for filtering.
function cleanDuration(value, key) {
  if (!value) return { text: null, minutes: null };
  let t = collapseWs(String(value).replace(/\*\*/g, ' '))
    .replace(/^[\s~\-–—•]+\s*/, '')
    .replace(META_LEAD_JUNK, '')
    .trim();

  let prev;
  do {
    prev = t;
    t = t.replace(META_TAIL_JUNK, '').replace(/[;:,|]+$/, '').trim();
  } while (t !== prev && t !== '');

  if (!t) return { text: null, minutes: null };

  const phrases = collectDurationPhrases(t);
  if (phrases.length === 0) return { text: normalizeUnits(t), minutes: null };

  // Scraped flattening concatenates several values on one line
  // ("5 mins 10 mins 15 mins"). The first phrase belongs to the key itself;
  // for totalTime a flattened 3-value run means the LAST value is the total.
  let chosen = phrases[0];
  if (key === 'totalTime' && phrases.length >= 3) chosen = phrases[phrases.length - 1];

  const text = phrases.length >= 2 ? canonicalDurationText(chosen.minutes) : normalizeUnits(t);
  return { text, minutes: chosen.minutes };
}

const SERV_TAIL_JUNK = /(?:\s*(?:step\s*\d+|calories?|extra|additional|course|\d*x\b|by|over|immediately|cold)\b)+$/i;
const SERV_MID_JUNK = /\s*(?:step\s*\d+|calories?|extra|additional)\b/gi;
const SERV_WORD_JUNK = /\b(?:servings?|serves)\b/gi;

// Clean a servings/yield value; derive min/max counts for filtering.
function cleanServings(value) {
  if (!value) return { text: null, min: null, max: null };
  let t = collapseWs(String(value).replace(/\*\*/g, ' '));
  // Lowercase "SERVINGS"/"SERVES" markers (scrape casing noise)
  t = t.replace(SERV_WORD_JUNK, (w) => w.toLowerCase());
  let prev;
  do {
    prev = t;
    t = t.replace(SERV_TAIL_JUNK, '').replace(SERV_MID_JUNK, ' ').replace(/\s+/g, ' ').trim();
  } while (t !== prev && t !== '');

  // "6people" / "4servings" → "6 people" / "4 servings"
  t = t.replace(/(\d)\s*(people|servings?|serves)(?=\s|$)/gi, '$1 $2').trim();
  // Normalize dash spacing: "4-6" / "4 - 6" → "4 - 6"
  t = t.replace(/\s*([\-–—])\s*/g, ' $1 ').replace(/\s+/g, ' ').trim();

  if (!t || !/\d/.test(t)) return { text: null, min: null, max: null };

  const nums = (t.match(/\d+/g) || []).map(Number);
  return { text: t, min: Math.min(...nums), max: Math.max(...nums) };
}

// ── Description cleaning ─────────────────────────────────
const DESC_BOILERPLATE = /cook mode|prevent your screen from going dark|jump to recipe|print recipe|rate this|review this|pin this/i;
const DESC_LIST_MARKER = /^[-*|>#]|^\d+[.)]/;
const DESC_META_LINE = /\*\*[^*]+:\*\*/;
const DESC_LABEL_PREFIX = /^(nutrition|calories|servings?|serves|yield|prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time|active\s*time|difficulty|category|cuisine)\s*[:~–—-]?/i;

// Turn a raw extracted block into clean prose: drop list/table/heading
// markers, bold meta lines, ratings, and boilerplate.
function cleanDescription(raw, title) {
  if (!raw) return '';
  const lines = Array.isArray(raw) ? raw : String(raw).split(/\r?\n/);
  const keep = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (DESC_LIST_MARKER.test(t)) continue;
    if (DESC_META_LINE.test(t)) continue;
    if (DESC_LABEL_PREFIX.test(t)) continue;
    if (DESC_BOILERPLATE.test(t)) continue;
    if (/^\d+\s*\/\s*\d+\s*$/.test(t)) continue;
    if (t.length < 12) continue;
    keep.push(t.replace(/\*\*/g, '').trim());
  }
  let out = collapseWs(keep.join(' '));
  if (out.length < 12) return '';

  // Drop a leading sentence that merely echoes the title
  // (e.g. "Best Chicken Quesadilla Recipe - How to Make Chicken Quesadillas").
  const tAlnum = (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (tAlnum.length >= 5) {
    const oAlnum = out.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (oAlnum.startsWith(tAlnum) && oAlnum.length - tAlnum.length <= 40) {
      // find the end of the first sentence after the echo
      const remain = out.replace(/^[^.!?]{0,80}[.!?]\s*/, '');
      if (remain.trim().length >= 12) out = remain.trim();
    }
  }
  return collapseWs(out);
}

function extractTitle(content, filename) {
  // Try to get title from first # heading that isn't a section name
  const h1Matches = [...content.matchAll(/^#\s+(.+)$/gm)];
  for (const match of h1Matches) {
    const candidate = cleanTitle(match[1]);
    if (candidate && !SECTION_HEADINGS.test(candidate)) {
      return candidate;
    }
  }
  // Fall back to filename without extension
  return cleanTitle(filename.replace(/\.md$/, ''));
}

function extractDescription(content, title) {
  // Try Description section
  const descMatch = content.match(/##\s+Description\s*\n+([\s\S]+?)(?=\n##|\n---|\n\*\*|$)/i);
  if (descMatch) {
    const cleaned = cleanDescription(descMatch[1], title);
    if (cleaned) return cleaned.substring(0, 300);
  }

  // Try Overview section, filtering out the metadata bullet block
  const overviewMatch = content.match(/##\s+Overview\s*\n+([\s\S]+?)(?=\n##|\n---|\n\*\*|$)/i);
  if (overviewMatch) {
    const cleaned = cleanDescription(overviewMatch[1], title);
    if (cleaned) return cleaned.substring(0, 300);
  }

  // Try first non-empty, non-heading, non-source paragraph
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('Source:') &&
        !trimmed.startsWith('http') && !trimmed.startsWith('|') && !trimmed.startsWith('-') &&
        !trimmed.startsWith('*') && trimmed.length > 12) {
      const cleaned = cleanDescription(trimmed, title);
      if (cleaned) return cleaned.substring(0, 300);
    }
  }

  return '';
}

function cleanMetaValue(val) {
  if (!val) return null;
  const v = collapseWs(val.replace(/\*\*/g, ' '));
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
    { key: 'prepTime', regex: /\*\*[Pp]rep(?:aration)?\s*[Tt]ime(?:\*\*:|:\*\*)\s*([^\n|*]+)/i },
    { key: 'cookTime', regex: /\*\*[Cc]ook(?:ing)?\s*[Tt]ime(?:\*\*:|:\*\*)\s*([^\n|*]+)/i },
    { key: 'totalTime', regex: /\*\*[Tt]otal\s*[Tt]ime(?:\*\*:|:\*\*)\s*([^\n|*]+)/i },
    { key: 'servings', regex: /\*\*[Ss]erv(?:ings?|es?)(?:\*\*:|:\*\*)\s*([^\n|*]+)/i },
    { key: 'yield', regex: /\*\*[Yy]ield(?:\*\*:|:\*\*)\s*([^\n|*]+)/i },
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

const INGREDIENT_JUNK = /cook mode|prevent your screen from going dark|jump to recipe|ratings?|^\d+\u2605|^step\s*\d+\s*[:.]?\s*|^(print(able)?|share|save|rate|review|pin)(\s|$)|^(?:method|notes?|steps?|tips?)\s*\)?[),.:;]*$/i;
const INGREDIENT_RATING = /^\d+\s*\/\s*\d+\s*$/;

function isJunkIngredient(line, title) {
  if (INGREDIENT_JUNK.test(line) || INGREDIENT_RATING.test(line)) return true;
  // Title echo (e.g. "BEST Stuffed Grape Leaves (Dolmas) - The Mediterranean Dish")
  const tNorm = (title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (tNorm && !/\d/.test(line) && line.length > 20) {
    const lNorm = line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (lNorm && lNorm.includes(tNorm)) return true;
  }
  return false;
}

function cleanIngredient(line) {
  return line.replace(/\*\*/g, '').replace(/\[.*?\]/g, '').trim();
}

function extractIngredients(content, title = '') {
  const ingredients = [];

  // Strategy 1: Find the Ingredients or Mise en Place section and extract all list items
  // We do this line-by-line to avoid regex multiline anchoring issues
  const lines = content.split('\n');
  let inIngredSection = false;
  let ingredDepth = 0; // heading depth of Ingredients section

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      const depth = headingMatch[1].length;
      const heading = headingMatch[2].trim().replace(/[:\s]+$/, '');

      // Support both "Ingredients" and "Mise en Place" (French culinary standard)
      if (/^(ingredients?|mise\s+en\s+place)$/i.test(heading)) {
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
        const clean = cleanIngredient(listMatch[1]);
        if (clean && clean.length > 2 && clean.length < 200 && !isJunkIngredient(clean, title)) {
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
        if (ingredient && ingredient.length < 100 && !/^[Ii]ngredient$/.test(ingredient) && !isJunkIngredient(amount ? `${ingredient} — ${amount}` : ingredient, title)) {
          ingredients.push(amount ? `${ingredient} — ${amount}` : ingredient);
        }
      }
    } else if (inIngredTable && !line.trim().startsWith('|') && line.trim()) {
      inIngredTable = false;
    }
  }

  // Strategy 3: Fallback for **For the X:** sub-sections (handles complex multi-part recipes)
  if (ingredients.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match **For the X:** patterns
      if (/^\*\*For the .+:\*\*/.test(line) || /^\*\*For .+:\*\*/.test(line)) {
        // Extract bullet list items following this sub-section
        for (let j = i + 1; j < lines.length; j++) {
          const listMatch = lines[j].match(/^[\s]*[-*]\s+(.+)$/);
          if (listMatch) {
            const clean = cleanIngredient(listMatch[1]);
            if (clean && clean.length > 2 && clean.length < 200 && !isJunkIngredient(clean, title)) {
              ingredients.push(clean);
            }
          } else if (lines[j].trim() && !lines[j].startsWith('*') && !lines[j].startsWith(' ') && !lines[j].startsWith('\t')) {
            // Stop at non-list, non-empty line (likely next section)
            break;
          }
        }
      }
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
    const stat = fs.statSync(filePath);

    const title = extractTitle(content, name);
    const description = extractDescription(content, title);
    const rawMeta = extractMeta(content);
    const categories = detectCategories(content, title, filename, subdir);
    const ingredients = extractIngredients(content, title);
    const source = getSource(content);

    const prep = cleanDuration(rawMeta.prepTime, 'prepTime');
    const cook = cleanDuration(rawMeta.cookTime, 'cookTime');
    const total = cleanDuration(rawMeta.totalTime, 'totalTime');
    const serv = cleanServings(rawMeta.servings || rawMeta.yield);

    return {
      id: slugify(title || name),
      title: title || name,
      filename: name,
      subdir,
      description,
      categories,
      ingredients,
      meta: {
        prepTime: prep.text,
        cookTime: cook.text,
        totalTime: total.text,
        servings: serv.text,
        prepTimeMinutes: prep.minutes,
        cookTimeMinutes: cook.minutes,
        totalTimeMinutes: total.minutes,
        servingsMin: serv.min,
        servingsMax: serv.max,
      },
      source,
      dateAdded: stat.mtime.toISOString(), // file mtime — used for "Recent Recipes"
      content, // full markdown content (kept for the detail view; not part of the search record)
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

function build() {
  console.log('🍳 Building recipe index...\n');
  console.log(`  Source: ${RECIPES_DIR}`);
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
}

if (require.main === module) {
  build();
}

module.exports = {
  slugify,
  cleanTitle,
  cleanDescription,
  cleanDuration,
  cleanServings,
  extractTitle,
  extractDescription,
  extractMeta,
  extractIngredients,
  isJunkIngredient,
};