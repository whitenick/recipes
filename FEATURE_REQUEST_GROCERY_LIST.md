# Feature Request: Grocery List

**Requested by:** Nick  
**Date:** 2026-04-04  
**Status:** Pending implementation

## Description

Add a **grocery list feature** to the recipe website that allows users to:
1. Select multiple recipes
2. Generate a consolidated grocery list
3. Combine duplicate ingredients intelligently
4. Organize by store section
5. Print or export the list

## User Flow

1. User browses recipes and clicks "Add to Grocery List" button on recipe cards
2. Selected recipes are marked (visual indicator)
3. User clicks "View Grocery List" button in header
4. System generates consolidated list with:
   - Combined quantities (e.g., "2 lemons" + "3 lemons" = "5 lemons")
   - Organized by category:
     - 🥬 Produce
     - 🐟 Protein
     - 🧀 Dairy & Cheese
     - 🌾 Grains & Pantry
     - 🥜 Nuts & Seeds
     - 🧂 Spices & Condiments
   - Checkboxes for marking items as purchased
5. User can print or export (plain text/markdown)

## Technical Requirements

### Data Structure

Each recipe should have ingredients parsed into:
```json
{
  "quantity": "2",
  "unit": "lbs",
  "item": "pork loin",
  "category": "protein",
  "notes": "boneless"
}
```

### Smart Combining

- Combine like items: "2 lemons" + "3 lemons" = "5 lemons"
- Handle unit conversions: "1 cup" + "8 oz" (if same ingredient)
- Keep separate if preparation differs: "minced garlic" vs "whole garlic cloves"
- Flag conflicts for manual review

### Categories

Auto-categorize ingredients:
- **Produce:** vegetables, fruits, fresh herbs
- **Protein:** meat, poultry, seafood, eggs
- **Dairy & Cheese:** milk, yogurt, cheese (but NOT milk for Sarah)
- **Grains & Pantry:** rice, pasta, flour, canned goods
- **Nuts & Seeds:** (important for allergen tracking)
- **Spices & Condiments:** dried herbs, spices, oils, vinegars, sauces

### Storage

- Use localStorage to persist selected recipes
- Use localStorage to persist checked items
- Clear on "Start New List" action

### UI

- "Add to Grocery List" button on each recipe card
- Badge/counter in header showing number of recipes selected
- "View Grocery List" button opens modal or new page
- Grocery list view:
  - Organized by category
  - Checkboxes for each item
  - Print-friendly CSS
  - "Export as Text" button
  - "Clear All" and "Remove Recipe" options

## Example Output

```
GROCERY LIST (3 recipes selected)

🥬 PRODUCE
□ Spinach (4 cups)
□ Zucchini (3-4 medium)
□ Potatoes (2 lbs, Russet or Yukon Gold)
□ Garlic (3 heads)
□ Fresh parsley (2 bunches)
□ Lemons (6-8)

🐟 PROTEIN
□ Pork loin (2-3 lbs, boneless)

🧀 DAIRY & CHEESE
□ Goat cheese (4-6 oz)
□ Parmesan cheese (2 oz)

🌾 GRAINS & PANTRY
□ Sun-dried tomatoes (1 jar, oil-packed)
□ Balsamic vinegar

🧂 SPICES & CONDIMENTS
□ Olive oil (check stock)
□ Salt, black pepper
```

## Implementation Priority

**High** — This is a frequently requested feature that increases the utility of the recipe site significantly.

## Related Files

- `app.js` — main app logic
- `style.css` — UI styling
- `index.html` — page structure
- `build.js` — recipe parser (may need to enhance ingredient extraction)

## Notes

- Consider mobile UX — grocery list should be easy to check off while shopping
- Consider sharing feature — generate a shareable link for grocery lists
- Consider recipe scaling — "Make this recipe for 8 people" should update grocery quantities

---

**Next Steps:**
Frank will implement this feature when he has capacity. In the meantime, users can manually extract ingredient lists from individual recipes.
