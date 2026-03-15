#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Nick & Sarah's Kitchen — Update & Deploy
#  Run this script to rebuild the recipe index and push to GitHub
#  Usage: bash update.sh
# ─────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🍳 Rebuilding recipe index..."
node build.js

echo ""
echo "📦 Committing changes..."
git add data/recipes.json
git add -A
git diff --cached --stat

if git diff --cached --quiet; then
  echo "✅ No changes to commit."
else
  RECIPE_COUNT=$(node -e "const d=require('./data/recipes.json'); console.log(d.length)")
  git commit -m "Update recipe collection ($RECIPE_COUNT recipes)"
  echo ""
  echo "🚀 Pushing to GitHub..."
  git push origin main
  echo ""
  echo "✅ Done! Site will be live in 30-60 seconds."
fi
