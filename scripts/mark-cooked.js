#!/usr/bin/env node
/**
 * mark-cooked.js — Mark a meal as cooked (or un-cooked)
 *
 * Usage:
 *   node scripts/mark-cooked.js <date> [true|false]
 *
 * Example:
 *   node scripts/mark-cooked.js 2026-03-18
 *   node scripts/mark-cooked.js 2026-03-18 false
 */

const fs = require('fs');
const path = require('path');

const PLAN_FILE = path.join(__dirname, '..', 'data', 'weekly-plan.json');
const [, , date, cookedArg = 'true'] = process.argv;

if (!date) {
  console.error('Usage: node scripts/mark-cooked.js <date> [true|false]');
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
const meal = plan.meals.find(m => m.date === date);

if (!meal) {
  console.error(`No meal found for ${date}`);
  process.exit(1);
}

meal.cooked = cookedArg !== 'false';
plan.updatedAt = new Date().toISOString();

fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2) + '\n');
console.log(`${meal.cooked ? '✅' : '⬜'} ${date} — ${meal.emoji} ${meal.title} marked ${meal.cooked ? 'cooked' : 'not cooked'}`);
