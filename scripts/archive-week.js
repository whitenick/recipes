#!/usr/bin/env node
/**
 * archive-week.js — Archive the current week's plan and reset for next week
 *
 * Usage:
 *   node scripts/archive-week.js
 *
 * Copies data/weekly-plan.json → data/cooking-log/YYYY-WNN.json
 * then resets weekly-plan.json to empty for the new week.
 *
 * Run this: Sunday night or Monday morning (or trigger via cron)
 */

const fs = require('fs');
const path = require('path');

const PLAN_FILE = path.join(__dirname, '..', 'data', 'weekly-plan.json');
const LOG_DIR = path.join(__dirname, '..', 'data', 'cooking-log');

if (!fs.existsSync(PLAN_FILE)) {
  console.log('No weekly plan found — nothing to archive.');
  process.exit(0);
}

const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));

if (!plan.meals || plan.meals.length === 0) {
  console.log('Weekly plan is empty — nothing to archive.');
  process.exit(0);
}

// Compute ISO week number for weekStart
function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const diff = d - startOfWeek1;
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { year: d.getUTCFullYear(), week };
}

const { year, week } = isoWeek(plan.weekStart);
const weekStr = `W${String(week).padStart(2, '0')}`;
const archiveName = `${year}-${weekStr}.json`;
const archivePath = path.join(LOG_DIR, archiveName);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Add archive metadata
plan.archivedAt = new Date().toISOString();
plan.cookedCount = plan.meals.filter(m => m.cooked).length;

fs.writeFileSync(archivePath, JSON.stringify(plan, null, 2) + '\n');
console.log(`📦 Archived ${plan.meals.length} meals → data/cooking-log/${archiveName}`);
console.log(`   Cooked: ${plan.cookedCount}/${plan.meals.length}`);

// Reset weekly plan (empty, no week bounds yet — add-meal.js will set them on next entry)
const empty = { weekStart: '', weekEnd: '', meals: [], updatedAt: new Date().toISOString() };
fs.writeFileSync(PLAN_FILE, JSON.stringify(empty, null, 2) + '\n');
console.log('🔄 Weekly plan reset for next week.');
