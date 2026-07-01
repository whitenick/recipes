# Recipe Pipeline — Nick's Kitchen

How recipes go from a markdown file in Obsidian to a live, searchable website on GitHub Pages.

---

## 1. Source of Truth: The Obsidian Vault

All recipes live as individual `.md` files in:

```
/home/jobin/obsidian-mac-vault/General/Personal/Culinary/Recipes/
```

This directory is shared between Nick, Sarah, and the assistant agents (Pierre, Frank). Anything written here by any of them is automatically available to the build pipeline.

### When a New Recipe Is Added

Anyone (Nick, Sarah, Pierre) can drop a new `.md` file into the vault. The build script (`build.js`) reads every `.md` file in the directory tree — including files inside subdirectories. Skip patterns:

- Directories named `weekly plan*`, `planning`, `notes` are ignored
- Files whose names start with `weekly`, `meal plan`, `shopping`, `planner`, `todo`, `notes`, `index` are ignored
- `_TEMPLATE.md` is not ignored by the parser, but it has no recipe content so it produces empty data

---

## 2. Recipe Format

Every recipe follows the format defined in `_TEMPLATE.md`. The build script handles some variation but works best when recipes use this exact structure.

### Required Elements

```markdown
# Title (H1 only — the first H1 becomes the recipe title)

**Serves:** N
**Total time:** X minutes
**Technique:** Primary techniques

---

[Intro paragraph — what makes the dish special]

---

## Dietary Notes
- **Nut-free**, **peanut-free**, **lentil-free**, **pea-free** ✅

---

## Mise en Place

### Component Group Name
- Item, prep state (diced, minced, etc.)
- Item, prep state

---

## Timeline (work backward from serving time)

- **6:00 PM** — First action
- **6:15 PM** — Next action
- **7:00 PM** — **Serve**

---

## Execution

### Step 1: Title
Numbered steps with specific temps, timing, and technique.

1. **Critical:** Callouts in bold with the *why*.
2. Continue with numbered steps.

---

## Plating

How it comes together.

---

## Chef's Notes

Personal insights from the cook — taste/texture cues, shortcuts that don't compromise quality, how to tell when it's done without a thermometer, the one thing not to skip.

---

## Tags

#tag1 #tag2

**Source:** URL
```

### What the Parser Extracts (and How)

| Field | Extraction Method |
|-------|------------------|
| **Title** | First `# H1` heading that isn't a section name. Falls back to filename stem. |
| **Description** | `## Description` or `## Overview` section content. Falls back to first long non-heading paragraph. |
| **Prep Time** | `**Prep Time:** N minutes` — inline bold format, also table format. |
| **Cook Time** | `**Cook Time:** N minutes` — same parsing. |
| **Total Time** | `**Total Time:** N minutes` — also `**Timeline:** 6:00 PM` pattern. |
| **Servings** | `**Serves:** N` or `**Servings:** N` or `**Yield:** N`. |
| **Categories** | Auto-detected from title, file subdirectory, and content analysis (see §3 below). |
| **Ingredients** | Bullet items under an `## Ingredients` or `## Mise en Place` heading. Also table format and `**For the X:**` sub-sections. |
| **Source URL** | `Source: https://...` at end of file. |

### Critical Format Rules for Reliable Parsing

1. **Title must be H1 (`# Title`)**. The first H1 that isn't a section heading name is used.
2. **`## Mise en Place`** or **`## Ingredients`** is required for ingredients to be extracted. The heading *must* be at H2 (`##`).
3. **Ingredients must be bullet items** (`- item` or `* item`) under that heading.
4. **Meta fields** (`**Serves:**`, `**Total time:**`, etc.) must use **bold markers (`**`)** with a colon separator.
5. **Table format works too** — `\| Ingredient \| Amount \|` tables under the ingredients heading are parsed.
6. **The intro paragraph** after the metadata block should be ≥20 characters. Shorter text may not be picked up as the description.

---

## 3. Auto-Categorization (build.js)

The build script classifies every recipe into categories automatically. This powers the filter chips on the website. The detection is content-driven, not manual.

### Detection Strategy

1. **Subdirectory bootstrap** — Todd's Kitchen subfolders (`soup/`, `bfast/`, `desert/`, `salad/`, `starters/`, `sauces/`, `bread/`, `veggy/`, `pizza/`) pre-populate categories.
2. **Title regex** — The recipe's title is scanned for protein keywords (`salmon`, `chicken`, `beef`, `pork`, `lamb`) and dish-type keywords (`soup`, `pasta`, `salad`, `bread`, `cake`).
3. **Content scan** — For slug-style filenames, the first 250 characters of content are also scanned.
4. **Veggie-only heuristics** — A list of known vegetarian dish names (ratatouille, shakshuka, black bean, etc.) is cross-referenced. If none of the protein categories match, `Vegetarian` is assigned.
5. **Quick & Easy** — If the description contains `weeknight`, `quick`, `easy`, `simple`, `30-min`, `fast`, or `10 min`, that category is added.

### All Categories

`Seafood` · `Chicken` · `Beef` · `Pork` · `Lamb` · `Soups & Stews` · `Pasta` · `Salads` · `Baking` · `Breakfast` · `Desserts` · `Appetizers` · `Sauces & Condiments` · `One-Pan` · `Vegetarian` · `Quick & Easy` · `Other`

### Limitations

- **No manual tagging in the markdown** — categories can't be set by the recipe author directly. They're entirely auto-detected.
- **A recipe can have multiple categories** (e.g., Chicken + Soups & Stews + Quick & Easy).
- **False positives happen** — if a recipe's title contains a word that triggers a category but doesn't belong there, it lands in the wrong bucket. Fix: rename the file or adjust the title.

---

## 4. Build Pipeline

### Build Script: `/home/jobin/dev/recipes/build.js`

Run by:

```bash
cd /home/jobin/dev/recipes && node build.js
```

What it does:

1. Walks the entire Obsidian vault directory tree
2. Skips files/directories matching the exclusion patterns
3. For each `.md` file, extracts: `title`, `description`, `categories`, `ingredients`, `meta` (times + servings), `source`, and the full `content` (raw markdown)
4. Sorts all recipes alphabetically by title
5. Writes `data/recipes.json` — a JSON array of recipe objects

### Output: `data/recipes.json`

Each recipe object looks like:

```json
{
  "id": "crispy-roasted-chicken-thighs-with-pan-sauce",
  "title": "Crispy Roasted Chicken Thighs with Pan Sauce",
  "filename": "Crispy Roasted Chicken Thighs with Pan Sauce",
  "subdir": "",
  "description": "The most reliable weeknight dinner...",
  "categories": ["Chicken", "One-Pan", "Quick & Easy"],
  "ingredients": ["4 bone-in skin-on chicken thighs", "2 shallots, finely minced", ...],
  "meta": {
    "prepTime": "10 minutes",
    "cookTime": "40 minutes",
    "totalTime": "50 minutes",
    "servings": "2"
  },
  "source": "https://example.com/original-recipe",
  "content": "# Crispy Roasted Chicken Thighs with Pan Sauce\n\n**Serves:** 2\n..."
}
```

### Deploy Script: `/home/jobin/dev/recipes/update.sh`

```bash
bash update.sh
```

What it does:

1. Runs `node build.js` to rebuild `data/recipes.json`
2. Runs `git add -A` (catches new recipe files, menu pages, etc.)
3. Commits with a message like `"Update recipe collection (52 recipes)"`
4. Pushes to GitHub (`git push origin main`)

GitHub Pages automatically deploys the `main` branch. The site is live in 30–60 seconds.

### Another Build Path: Vercel

The site also has a `vercel.json` config, so it can be deployed via Vercel as well. The GitHub Pages deploy is the primary/current method.

---

## 5. Frontend: How Recipes Are Served

### `index.html` — Main page

- Renders recipe cards in a responsive grid
- Has search, category filter chips, grid/list toggle, favorites, grocery list
- Single-page app with hash-based routing
- Links to `#recipe/{id}` for individual recipe views

### `app.js` — Application logic

- Fetches `data/recipes.json` on page load
- **`handleRoute()`** — hash-based routing. `#recipe/{id}` shows a single recipe detail view; no hash shows the grid
- **`applyFilters()`** — searches by title, description, categories, and ingredients
- **`showDetail(recipe)`** — renders the full recipe page using `marked.js` (Markdown → HTML). Sets OG meta tags for link previews
- Favorites are stored in `localStorage`

### `grocery.js` — Grocery list feature

- Smart ingredient combination across selected recipes
- Groups items by store section: Produce, Meat & Seafood, Dairy & Eggs, Bakery & Bread, etc.
- Each section is detected by keyword matching against ingredient text

### Menu Pages

Separate HTML files for curated menus:
- `menus.html` — hub page listing all menus
- `menu-stanz.html`, `menu-sourduck.html`, `menu-luccas.html`, `menu-beach-break.html`, `menu-weeknight-gotos.html` — individual menus

Each menu page is a standalone HTML file with its own embedded styles. Menus don't go through the build pipeline — they're manually created and committed.

### `style.css` — Global styles

Shared across `index.html` and all menu pages.

---

## 6. Specific Prompt for Recipe Creation (Pierre)

When Pierre creates a new recipe for the vault, the following prompt/instruction is used. This is the internal instruction set that drives recipe generation:

### The Template Prompt

```
Create a recipe following this exact structure:

1. **Title:** H1 heading, descriptive, one line.
2. **Metadata block:** Serves, Total time, Technique, Source on separate bold lines.
3. **Intro:** One paragraph selling the dish — why it matters, what's special.
4. **Dietary Notes:** Mandatory section. Flag nut, peanut, lentil, pea status explicitly for Nick and Sarah. Note dairy substitutions for Sarah.
5. **Mise en Place:** Organized by component (sauce, protein, garnish — not alphabetically). Every ingredient has a full prep spec.
6. **Timeline:** Work backward from serving time in 5-15 minute blocks. Shows the cook what happens when.
7. **Execution:** Numbered steps with specific temperatures, specific timing, and specific technique. Bold for make-or-break callouts. Explain the why.
8. **Plating:** Mandatory. How the dish lands — sauce direction, garnish, accompaniments.
9. **Chef's Notes:** Optional but preferred. Personal insights — what to look/smell/listen for, shortcuts that don't compromise, the one thing not to skip.
10. **Critical Notes:** Experience-driven callouts. What matters most, pitfalls, technique truths.
11. **Tags:** #dietary #protein #style tags.
11. **Source line** at the bottom with URL.

Constraints:
- ALL recipes must be nut-free or include a nut-free variation. Nick and Sarah have anaphylactic-level allergies to peanuts and tree nuts.
- Sarah has a dairy allergy (cheese is OK — feta, mozzarella, parmesan, blue cheese).
- Nick avoids lentils and peas.
- Temperatures are specific, not relative. Timing is in minutes, not "until done."
- Every component matters. List everything.
```

This prompt is used by Pierre (and any other agent writing recipes) but is **not stored in the repo** — it's part of the agent's configuration in `AGENTS.md`, `SOUL.md`, `MEMORY.md`, and the vault's `_TEMPLATE.md`.

---

## 7. Roles & Responsibilities

| Role | Who | What They Do |
|------|-----|-------------|
| **Recipe Author** | Pierre | Writes recipes to the vault. Follows `_TEMPLATE.md`. |
| **Recipe Author** | Nick, Sarah | Write recipes to the vault (the original source). |
| **Technical Deploy** | Frank | Runs `update.sh`, pushes to GitHub, manages build issues. |
| **Approval Gate** | Nick (or Pierre as delegate) | Must approve before Frank pushes the deploy live. |
| **UX & Features** | Frank (with specs from Pierre) | Frontend changes, grocery list, search, menu pages. |

### Deploy Flow

```
Vault markdown  →  build.js  →  data/recipes.json  →  git push  →  GitHub Pages  →  Live site
     ↑                    ↑               ↑                    ↑
  Pierre writes       Frank runs      Frank commits       Nick approves
```

---

## 8. File Map

```
/home/jobin/dev/recipes/              ← Website repo root
├── index.html                        ← Main recipe browser (SPA)
├── menus.html                        ← Menu hub listing
├── menu-weeknight-gotos.html         ← Individual menu pages
├── menu-stanz.html
├── menu-sourduck.html
├── menu-luccas.html
├── menu-beach-break.html
├── app.js                            ← Frontend app (routing, filtering, rendering)
├── grocery.js                        ← Grocery list feature
├── build.js                          ← Recipe parser (vault → json)
├── style.css                         ← Global styles
├── update.sh                         ← Build + deploy script
├── data/
│   ├── recipes.json                  ← Generated recipe database (do not edit manually)
│   └── featured.json                 ← Featured recipe IDs (optional)
├── RECIPE_PIPELINE.md                ← THIS FILE
├── README.md                         ← Project readme
├── _TEMPLATE.md                      ← (referenced from vault, not in repo)
└── vercel.json                       ← Vercel deploy config (optional)

/home/jobin/obsidian-mac-vault/General/Personal/Culinary/Recipes/
├── _TEMPLATE.md                      ← Recipe format template
├── Bolognese.md                      ← Individual recipes
├── Crispy Roasted Chicken Thighs with Pan Sauce.md
├── ... (50+ recipe files)
├── Todd's Kitchen/                   ← Subdirectory with additional recipes
│   ├── Soup/
│   ├── Entree/
│   └── ...
└── ... (other subdirectories)
```

---

## 9. Troubleshooting

### Ingredients aren't showing up on the website

Check the recipe's `## Mise en Place` or `## Ingredients` heading. It must be **exactly** at H2 (`##`). H3 (`###`) won't be recognized. Bullet items (`-`) must follow immediately after.

### The recipe has the wrong category

Categories are auto-detected from the title and content. If `Salmon BLT` somehow gets tagged as `Beef`, rename the file or adjust the title. There's no manual category override.

### The description is wrong or missing

The parser reads from `## Description` or `## Overview` sections. If neither exists, it falls back to the first long paragraph. Make sure the intro paragraph after the metadata block is ≥20 characters.

### Site isn't updating after git push

Check GitHub Actions for the deploy status. GitHub Pages can take 30–60 seconds. If it's been longer, run `bash update.sh` manually.

---

*Last updated: 2026-07-01*
*Maintainer: Frank (via Pierre delegation)*