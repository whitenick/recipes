# Media Pattern — Stills + Build Shorts (WILS-154)

How real content lands on a recipe page: one **hero still** on the card and at
the top of the detail view, plus one **build short** embedded in the body.
Written for AI-drafted Sandwich Sundays recipes, and used by the parser and the
site renderer.

---

## 1. Cover still

Declare it once, near the top of the markdown, using an `Image:` line:

```markdown
# Italian Sub

**Serves:** 4
**Total time:** 20 minutes
**Technique:** assembly
**Image:** /media/sandwich-sundays/SS-2026-10-04-italian-sub/hero.jpg
```

Accepted forms (priority order — `build.js` → `extractCoverImage`):

1. `Image: <url>` or `**Image:** <url>` (preferred — explicit and stable).
2. `![alt](<url>)` — the first markdown image in the file.
3. `<img src="<url>">` — the first raw-HTML image in the file.

If none is present, the site keeps the category emoji placeholder. The parsed
URL is stored as `coverImage` on the recipe in `data/recipes.json` (absolute URL
or root-relative path passed through as authored).

**Rendering:**

- **Cards** — the still fills the circular card image, replacing the emoji. If
  the image fails to load it removes itself and the emoji is the fallback.
- **Detail header** — the still renders as a full-width cover between the title
  and the meta grid. The `Image:` declaration is stripped from the rendered body
  so it never appears twice.

Put the still **once**. Don't repeat it in the body markdown.

---

## 2. Build short

The short is embedded in the body as raw HTML — `marked` passes it through and
the site styles it for the reading column and mobile:

```markdown
## The Build

<video controls playsinline preload="metadata"
       poster="/media/sandwich-sundays/SS-2026-10-04-italian-sub/hero.jpg">
  <source src="/media/sandwich-sundays/SS-2026-10-04-italian-sub/short.mp4" type="video/mp4">
</video>
```

- `controls playsinline` — tap to play, never autoplay.
- `preload="metadata"` — poster shows immediately, the clip loads on demand.
- `poster` — reuse the hero still; the page looks complete before playback.
- One unbroken take, 10–25s, hands only. Keep it under ~5 MB.

Any stills in the body (process shots, cross-sections) are plain markdown
images; they render full-width, rounded, and capped on phones:

```markdown
![Cross-section of the finished sub](/media/sandwich-sundays/SS-2026-10-04-italian-sub/cross.jpg)
```

---

## 3. Hosting + URL scheme

| | |
|---|---|
| Host | Cloudflare R2, public via `media.recipes.serapiolabs.com` (WILS-152) |
| Key layout | `sandwich-sundays/SS-YYYY-MM-DD-slug/hero.jpg` · `short.mp4` |
| Naming | `SS-2026-10-04-italian-sub` — Sunday date + slug, matches the pilot shot list |
| Until R2 is live | Files can sit in this repo's `public/media/sandwich-sundays/…` and be referenced as `/media/…` — the parser and renderer treat both identically |

**Swap-in when WILS-152 lands:** replace the path in the markdown with the
public R2 URL. No code change needed — `coverImage` and the `<video>` src pass
absolute URLs through untouched. A future automated path can rewrite
`/media/…` → the R2 base URL at build time from an env var.

---

## 4. Reference recipe skeleton

```markdown
# {Sandwich Name}

**Serves:** N
**Total time:** X minutes
**Technique:** assembly / griddle / roast
**Sandwich Sundays:** 2026-10-04 · #SS-01
**Image:** /media/sandwich-sundays/SS-2026-10-04-{slug}/hero.jpg

---

{Intro — what this sandwich is and why it's worth a Sunday.}

## The Story
{2–4 sentences: where it came from. Homage = credit + link.}

## The Build

<video controls playsinline preload="metadata" poster="…/hero.jpg">
  <source src="…/short.mp4" type="video/mp4">
</video>

…rest of the standard recipe template (Mise en Place, Timeline, Execution,
Plating, Chef's Notes)…

## Tags

#sandwichsunday #sandwich #{protein} #{style}
```

The `#sandwichsunday` tag (or living in the vault's `Sandwich Sundays/`
subfolder) is what puts a recipe in the site's **Sandwich Sundays** collection.
