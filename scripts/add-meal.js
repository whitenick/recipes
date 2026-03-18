#!/usr/bin/env node
/**
 * add-meal.js — Pierre's interface for "What's Nick Cooking"
 *
 * Usage:
 *   node scripts/add-meal.js <date> <title> [description] [emoji] [recipeSlug] [cooked]
 *
 * Examples:
 *   node scripts/add-meal.js 2026-03-18 "Thai Tofu Curry" "Coconut milk curry with firm tofu" "🍛"
 *   node scripts/add-meal.js 2026-03-19 "Pasta Carbonara" "" "🍝" "pasta-carbonara" false
 *
 * Parameters:
 *   date        YYYY-MM-DD (required)
 *   title       Meal name (required)
 *   description Short description (optional, default "")
 *   emoji       Single emoji (optional, default "🍽️")
 *   recipeSlug  Recipe ID from recipes.json (optional, null if not in collection)
 *   cooked      true|false — whether it's been cooked yet (optional, default false)
 */

const fs = require('fs');
const path = require('path');

const PLAN_FILE = path.join(__dirname, '..', 'data', 'weekly-plan.json');

const [, , date, title, description = '', emoji = '🍽️', recipeSlug = null, cooked = 'false'] = process.argv;

if (!date || !title) {
  console.error('Usage: node scripts/add-meal.js <date> <title> [description] [emoji] [recipeSlug] [cooked]');
  process.exit(1);
}

// Validate date
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Date must be in YYYY-MM-DD format');
  process.exit(1);
}

// Get week bounds (Monday–Sunday) for the given date
function getWeekBounds(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAYS[d.getUTCDay()];
}

// Load current plan
let plan = { weekStart: '', weekEnd: '', meals: [] };
if (fs.existsSync(PLAN_FILE)) {
  plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
}

const { weekStart, weekEnd } = getWeekBounds(date);

// If the date is outside the current week, warn
if (plan.weekStart && plan.weekStart !== weekStart) {
  console.warn(`⚠️  Date ${date} is in a different week (${weekStart}–${weekEnd}) than current plan (${plan.weekStart}–${plan.weekEnd}).`);
  console.warn('   Run archive-week.js first to archive the old week, then re-run this.');
  process.exit(1);
}

// Update week bounds if plan is empty/fresh
if (!plan.weekStart) {
  plan.weekStart = weekStart;
  plan.weekEnd = weekEnd;
}

// Remove existing entry for this date (replace it)
plan.meals = plan.meals.filter(m => m.date !== date);

// Add the new meal
plan.meals.push({
  date,
  day: getDayName(date),
  title,
  description,
  recipeSlug: recipeSlug && recipeSlug !== 'null' ? recipeSlug : null,
  emoji,
  cooked: cooked === 'true' || cooked === true,
});

// Sort by date
plan.meals.sort((a, b) => a.date.localeCompare(b.date));

plan.updatedAt = new Date().toISOString();

fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2) + '\n');
console.log(`✅ Added: ${date} (${getDayName(date)}) — ${emoji} ${title}`);
console.log(`   Week: ${plan.weekStart} → ${plan.weekEnd} | Total meals: ${plan.meals.length}`);
