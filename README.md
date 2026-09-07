# 🍽 Nick's Kitchen

Personal recipe collection — searchable, mobile-friendly, and always up to date.

**Live site:** https://whitenick.github.io/recipes/

## Features

- 🔍 Search by name, ingredient, or category
- 📱 Mobile-friendly responsive design
- ♥️ Save favorites to local storage
- 🖨️ Print-friendly recipe view
- ⚡ Fast, static site — no server needed

## Tech

- Pure HTML/CSS/JavaScript (no framework)
- Markdown rendered with `marked.js`
- Recipes parsed from Obsidian `.md` files
- Deployed via GitHub Pages

## Updating Recipes

When you add new `.md` files to the Obsidian vault, run:

```bash
bash update.sh
```

This rebuilds `data/recipes.json` from the Obsidian vault and pushes to GitHub. The site auto-updates in ~30 seconds.

## Local Development

```bash
# Rebuild recipe index (RECIPES_DIR overrides the vault path when set)
RECIPES_DIR="/path/to/.../Recipes" node build.js

# Run the corpus/pipeline tests
node --test

# Preview locally
npx serve . -l 3456
# → http://localhost:3456
```

## Search Data Model

`data/recipes.json` is the normalized corpus consumed by the (upcoming)
search service. See [`docs/search-data-model.md`](docs/search-data-model.md)
for the field contract, searchable-vs-filterable mapping, and rebuild/reindex
instructions.

## Recipe Format

Recipes are Markdown files in `/home/jobin/obsidian-mac-vault/General/Personal/Culinary/Recipes/`.

The build script automatically extracts:
- Title (from `# Heading` or filename)
- Description (from Overview/Description sections)
- Metadata (prep time, cook time, servings)
- Categories (auto-detected from content)
- Ingredients (from lists and tables)
