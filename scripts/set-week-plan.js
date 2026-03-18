#!/usr/bin/env node
/**
 * set-week-plan.js — Bulk-set an entire week's meal plan
 *
 * Usage (CLI — one meal per arg, colon-separated):
 *   node scripts/set-week-plan.js <weekStartDate> \
 *     "Mon:Title:Description:🍽️:recipeSlug" \
 *     "Tue:Title:Description:🍝:null" \
 *     ...
 *
 * Usage (JSON file):
 *   node scripts/set-week-plan.js --json /path/to/meals.json
 *
 * CLI meal format: "Day:Title:Description:Emoji:RecipeSlug"
 *   - Day:        Mon|Tue|Wed|Thu|Fri|Sat|Sun  (or YYYY-MM-DD)
 *   - Title:      Meal name (required)
 *   - Description: Short description (optional, use "" to skip)
 *   - Emoji:      Single emoji (optional, default 🍽️)
 *   - RecipeSlug: Recipe id from recipes.json, or "null"
 *
 * Examples:
 *   node scripts/set-week-plan.js 2026-03-16 \
 *     "Mon:Pasta Aglio e Olio:Quick weeknight pasta:🍝:pasta-aglio-e-olio" \
 *     "Tue:Thai Tofu Curry:Coconut milk curry:🍛:null" \
 *     "Wed:Sheet Pan Chicken:Roasted with veggies:🍗:sheet-pan-chicken" \
 *     "Thu:Black Bean Tacos:Quick and veggie-packed:🌮:null" \
 *     "Fri:Salmon with Roasted Asparagus::🐟:salmon-asparagus"
 *
 *   # JSON file input (useful for Pierre's workflow):
 *   node scripts/set-week-plan.js --json 2026-03-16-plan.json
 *
 * JSON format:
 * [
 *   { "date": "2026-03-16", "title": "Pasta Aglio e Olio", "description": "...", "emoji": "🍝", "recipeSlug": "pasta-aglio-e-olio" },
 *   ...
 * ]
 */

const fs = require('fs');
const path = require('path');

const PLAN_FILE = path.join(__dirname, '..', 'data', 'weekly-plan.json');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
// Monday = index 0 in week
const DAY_OFFSET = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function getWeekBounds(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
    monday,
  };
}

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAYS[d.getUTCDay()];
}

function parseCliMeal(arg, monday) {
  const parts = arg.split(':');
  const [dayToken, title, description = '', emoji = '🍽️', recipeSlugRaw = 'null'] = parts;

  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayToken)) {
    date = dayToken;
  } else {
    const abbr = dayToken.toLowerCase().slice(0, 3);
    const offset = DAY_OFFSET[abbr];
    if (offset === undefined) {
      console.error(`Unknown day abbreviation: "${dayToken}". Use Mon, Tue, Wed, Thu, Fri, Sat, Sun.`);
      process.exit(1);
    }
    const mealDate = new Date(monday);
    mealDate.setUTCDate(monday.getUTCDate() + offset);
    date = mealDate.toISOString().slice(0, 10);
  }

  return {
    date,
    day: getDayName(date),
    title,
    description,
    recipeSlug: recipeSlugRaw === 'null' || !recipeSlugRaw ? null : recipeSlugRaw,
    emoji: emoji || '🍽️',
    cooked: false,
  };
}

// ── Main ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/set-week-plan.js <weekStart|--json> [meals...]');
  process.exit(1);
}

let weekStartArg, meals;

if (args[0] === '--json') {
  // JSON file mode
  const jsonFile = args[1];
  if (!jsonFile) {
    console.error('Usage: node scripts/set-week-plan.js --json <file.json>');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) {
    console.error('JSON file must contain a non-empty array of meal objects.');
    process.exit(1);
  }
  // Derive weekStart from first meal's date
  weekStartArg = raw[0].date;
  const { weekStart, weekEnd, monday } = getWeekBounds(weekStartArg);
  meals = raw.map(m => ({
    date: m.date,
    day: getDayName(m.date),
    title: m.title,
    description: m.description || '',
    recipeSlug: m.recipeSlug || null,
    emoji: m.emoji || '🍽️',
    cooked: m.cooked || false,
  }));
} else {
  weekStartArg = args[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartArg)) {
    console.error('First argument must be a date in YYYY-MM-DD format (the week start, i.e. any day in the target week).');
    process.exit(1);
  }
  const { weekStart, weekEnd, monday } = getWeekBounds(weekStartArg);
  meals = args.slice(1).map(arg => parseCliMeal(arg, monday));
}

if (meals.length === 0) {
  console.error('No meals provided.');
  process.exit(1);
}

const { weekStart, weekEnd } = getWeekBounds(weekStartArg);

// Check all meals fall within the same week
for (const m of meals) {
  if (m.date < weekStart || m.date > weekEnd) {
    console.error(`Meal "${m.title}" on ${m.date} is outside the week ${weekStart}–${weekEnd}`);
    process.exit(1);
  }
}

// Sort by date
meals.sort((a, b) => a.date.localeCompare(b.date));

const plan = {
  weekStart,
  weekEnd,
  meals,
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2) + '\n');

console.log(`✅ Week plan set: ${weekStart} → ${weekEnd} (${meals.length} meals)`);
meals.forEach(m => {
  console.log(`   ${m.day.slice(0,3)} ${m.date}: ${m.emoji} ${m.title}`);
});
console.log('\nNext step:');
console.log('  git add data/weekly-plan.json && git commit -m "Meal plan: week of ' + weekStart + '" && git push origin main');
