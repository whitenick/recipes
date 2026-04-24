# Trout Gravlax Grocery List Parsing Issue

**Reported by:** Nick  
**Date:** 2026-04-24  
**Issue:** Trout Gravlax recipe not showing up correctly in grocery list when selected

---

## Problem

The recipe website's ingredient parser (`build.js`) cannot extract ingredients from the Trout Gravlax recipe because of a structure mismatch.

**Current Parser Logic:**
- Looks for a section heading: `## Ingredients` or `# Ingredients`
- Extracts all bullet list items under that heading
- Stops when it hits another same-level or higher heading

**Trout Gravlax Structure:**
```markdown
## Part 1: Trout Gravlax

### Mise en Place

**For the Trout:**
*   2 whole rainbow or steelhead trout (1–1.5 lbs/450–680g each)...
*   Paper towels

**For the Cure (per 2 lbs/900g fish):**
*   1/3 cup (80g) fine sea salt
*   1/4 cup (50g) granulated sugar
...

## Part 2: Alps-Style Coleslaw Remoulade

### Mise en Place

**For the Coleslaw Base:**
*   1/2 head green cabbage (about 1 lb/450g)
...
```

**Why It Fails:**
1. No `## Ingredients` heading — uses `### Mise en Place` instead
2. Ingredients split across multiple `**For the X:**` sub-sections
3. Two separate `## Part 1` and `## Part 2` sections (recipe has two components)

---

## Solution Options

### **Option A: Update Parser to Handle "Mise en Place"** (Recommended)

Extend the parser to recognize `Mise en Place` as a valid ingredients section heading.

**Code Change in `build.js`:**

```javascript
// Current
if (/^ingredients?$/i.test(heading)) {
  inIngredSection = true;
  ingredDepth = depth;
  continue;
}

// New (add Mise en Place support)
if (/^(ingredients?|mise\s+en\s+place)$/i.test(heading)) {
  inIngredSection = true;
  ingredDepth = depth;
  continue;
}
```

**Benefits:**
- Supports professional recipe format (French culinary standard)
- Minimal code change
- Works for future recipes using mise en place structure

**Potential Issues:**
- None — "Mise en Place" is unambiguous in recipe context

---

### **Option B: Add Fallback Pattern for Bold Sub-Sections**

Parse ingredients from `**For the X:**` sub-sections even without an `## Ingredients` heading.

**Logic:**
- If no `## Ingredients` found, scan for bold patterns like:
  - `**For the Trout:**`
  - `**For the Cure:**`
  - `**For the Coleslaw Base:**`
- Extract bullet lists immediately following these patterns

**Code Sketch:**
```javascript
// After Strategy 1 (Ingredients section) fails
if (ingredients.length === 0) {
  // Fallback: Look for **For the X:** patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\*\*For the .+:\*\*/.test(line)) {
      // Found a sub-section, extract following bullets
      for (let j = i + 1; j < lines.length; j++) {
        const listMatch = lines[j].match(/^[\s]*[-*]\s+(.+)$/);
        if (listMatch) {
          const clean = listMatch[1].replace(/\*\*/g, '').replace(/\[.*?\]/g, '').trim();
          if (clean && clean.length > 2 && clean.length < 200) {
            ingredients.push(clean);
          }
        } else if (lines[j].trim() && !lines[j].startsWith('*')) {
          // Stop at non-list content
          break;
        }
      }
    }
  }
}
```

**Benefits:**
- Handles edge cases where ingredients are highly structured
- Supports multi-component recipes (gravlax + remoulade)

**Potential Issues:**
- Could pick up non-ingredient lists if `**For the X:**` appears elsewhere

---

### **Option C: Standardize Recipe to Use `## Ingredients`** (Not Recommended)

Change the Trout Gravlax markdown to match the parser's expectations.

**Example:**
```markdown
## Ingredients

### For the Trout
*   2 whole rainbow or steelhead trout...

### For the Cure
*   1/3 cup (80g) fine sea salt...

### For the Coleslaw Base
*   1/2 head green cabbage...
```

**Benefits:**
- Works with existing parser immediately

**Drawbacks:**
- Loses the professional "Mise en Place" structure Pierre uses
- Recipe becomes less organized (no clear Part 1 vs Part 2 separation)
- Doesn't fix the underlying issue for future recipes

---

## Recommended Solution

**Implement Option A + Option B:**

1. **Add `Mise en Place` support** — Minimal, future-proof change
2. **Add `**For the X:**` fallback** — Handles edge cases and complex recipes

**Combined Logic:**
```javascript
function extractIngredients(content) {
  const ingredients = [];
  const lines = content.split('\n');
  let inIngredSection = false;
  let ingredDepth = 0;
  
  // Strategy 1: Ingredients or Mise en Place section
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const heading = headingMatch[2].trim().replace(/[:\s]+$/, '');
      
      // NEW: Support both "Ingredients" and "Mise en Place"
      if (/^(ingredients?|mise\s+en\s+place)$/i.test(heading)) {
        inIngredSection = true;
        ingredDepth = depth;
        continue;
      }
      
      if (inIngredSection && depth <= ingredDepth) {
        inIngredSection = false;
      }
    }
    
    if (inIngredSection) {
      const listMatch = line.match(/^[\s]*[-*]\s+(.+)$/) || line.match(/^[\s]*\d+\.\s+(.+)$/);
      if (listMatch) {
        const clean = listMatch[1].replace(/\*\*/g, '').replace(/\[.*?\]/g, '').trim();
        if (clean && clean.length > 2 && clean.length < 200) {
          ingredients.push(clean);
        }
      }
    }
  }
  
  // Strategy 2: Fallback for **For the X:** sub-sections
  if (ingredients.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\*\*For the .+:\*\*/.test(line)) {
        for (let j = i + 1; j < lines.length; j++) {
          const listMatch = lines[j].match(/^[\s]*[-*]\s+(.+)$/);
          if (listMatch) {
            const clean = listMatch[1].replace(/\*\*/g, '').replace(/\[.*?\]/g, '').trim();
            if (clean && clean.length > 2 && clean.length < 200) {
              ingredients.push(clean);
            }
          } else if (lines[j].trim() && !lines[j].startsWith('*') && !lines[j].startsWith(' ')) {
            break; // Stop at non-list line
          }
        }
      }
    }
  }
  
  // Strategy 3: Table format (existing logic)
  // ... (keep existing table parsing)
  
  return [...new Set(ingredients)].slice(0, 60);
}
```

---

## Testing

After implementation, verify:

1. **Trout Gravlax:** All ingredients from both Part 1 (gravlax) and Part 2 (remoulade) appear in grocery list
2. **Existing recipes:** No regressions (all existing recipes still parse correctly)
3. **Edge cases:**
   - Recipes with `## Ingredients` (should still work)
   - Recipes with `### Mise en Place` (new support)
   - Recipes with `**For the X:**` sub-sections (fallback)

---

## Next Steps

**For Frank:**
1. Implement Option A + B in `build.js`
2. Run `node build.js` to regenerate `data/recipes.json`
3. Test Trout Gravlax recipe in grocery list UI
4. Verify no regressions on existing recipes
5. Deploy to https://whitenick.github.io/recipes

**Expected Result:**
When Nick adds "Trout Gravlax with Alps-Style Coleslaw Remoulade" to the grocery list, it should show all ingredients properly categorized:
- Trout, salt, sugar, coriander, peppercorns, lemon, dill, gin/aquavit
- Cabbage, carrots, shallot, chives
- Mayonnaise, mustards, capers, cornichons, herbs, horseradish, vinegar, etc.

---

**Priority:** High (blocking grocery list feature for this recipe)  
**Complexity:** Low (simple parser enhancement)  
**Timeline:** 1-2 hours
