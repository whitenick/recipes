/**
 * Regression tests for the WILS-154 media + collection layer.
 *
 * Two layers:
 *   1. Unit tests for build.js parsing — cover-image convention and the
 *      Sandwich Sundays collection signal (subfolder or `#sandwichsunday` tag).
 *   2. Site invariants — the corpus carries `coverImage`, the sample Sandwich
 *      Sundays recipe exists with both a cover and the collection category, and
 *      the frontend/CSS still wire the card cover, detail hero, collection
 *      route, and the video embed pattern.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const build = require(path.join(ROOT, 'build.js'));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── Cover-image parsing ──────────────────────────────────

test('extractCoverImage: explicit Image: / **Image:** lines win', () => {
  assert.strictEqual(
    build.extractCoverImage('# Sub\n\n**Image:** https://media.example.com/hero.jpg\n'),
    'https://media.example.com/hero.jpg'
  );
  assert.strictEqual(
    build.extractCoverImage('# Sub\n\nImage: /media/sandwich-sundays/hero.jpg\n'),
    '/media/sandwich-sundays/hero.jpg'
  );
  // Explicit declaration beats an earlier/later inline image.
  assert.strictEqual(
    build.extractCoverImage('![inline](/inline.jpg)\n**Image:** /cover.jpg\n'),
    '/cover.jpg'
  );
});

test('extractCoverImage: falls back to first markdown / HTML image', () => {
  assert.strictEqual(
    build.extractCoverImage('# Sub\n\n![hero](/media/hero.jpg)\n'),
    '/media/hero.jpg'
  );
  assert.strictEqual(
    build.extractCoverImage('# Sub\n\n<img src="https://media.example.com/hero.jpg" alt="x">\n'),
    'https://media.example.com/hero.jpg'
  );
});

test('extractCoverImage: no image convention → null', () => {
  assert.strictEqual(build.extractCoverImage('# Plain recipe\n\nJust text.\n'), null);
  assert.strictEqual(build.extractCoverImage(''), null);
});

// ── Sandwich Sundays collection signal ───────────────────

test('detectCategories: Sandwich Sundays subfolder (top-level and nested)', () => {
  const content = '# The Italian\n\nA sandwich.\n';
  assert.ok(build.detectCategories(content, 'The Italian', 'The Italian.md', 'Sandwich Sundays')
    .includes('Sandwich Sundays'));
  assert.ok(build.detectCategories(content, 'The Italian', 'The Italian.md', 'Personal/Sandwich Sundays')
    .includes('Sandwich Sundays'));
  assert.ok(build.isSandwichSundays(content, 'Sandwich Sundays'));
});

test('detectCategories: #sandwichsunday tag adds the collection', () => {
  const content = '# The Italian\n\n## Tags\n\n#sandwichsunday #sandwich\n';
  assert.ok(build.detectCategories(content, 'The Italian', 'The Italian.md', '')
    .includes('Sandwich Sundays'));
});

test('detectCategories: unrelated recipes are not swept into the collection', () => {
  const cats = build.detectCategories('# Lasagna\n\nBaked pasta.\n', 'Lasagna', 'Lasagna.md', '');
  assert.ok(!cats.includes('Sandwich Sundays'), 'plain recipes stay out of the collection');
  assert.ok(cats.length > 0, 'a recipe always lands in at least one category');
});

// ── Corpus invariants ────────────────────────────────────

const corpus = JSON.parse(read('data/recipes.json'));

test('corpus: every recipe carries coverImage (string or null)', () => {
  for (const r of corpus) {
    assert.ok('coverImage' in r, `coverImage field on ${r.id}`);
    assert.ok(r.coverImage === null || typeof r.coverImage === 'string', `coverImage type on ${r.id}`);
  }
});

test('corpus: a Sandwich Sundays sample exists with cover + collection category', () => {
  const sunday = corpus.filter(r => Array.isArray(r.categories) && r.categories.includes('Sandwich Sundays'));
  assert.ok(sunday.length >= 1, 'expected at least one Sandwich Sundays recipe');
  const withCover = sunday.find(r => typeof r.coverImage === 'string' && r.coverImage.length > 0);
  assert.ok(withCover, 'the sample must carry a coverImage end to end');
});

// ── Site wiring ──────────────────────────────────────────

test('frontend renders cover images with emoji fallback and a collection route', () => {
  const js = read('src/main.js');
  assert.match(js, /recipe\.coverImage/, 'cards/detail must consume coverImage');
  assert.match(js, /recipe-card-image/, 'cards must render a cover image element');
  assert.match(js, /detail-cover/, 'detail view must render the cover hero');
  assert.match(js, /'#sandwich-sundays':\s*'Sandwich Sundays'/, 'collection route must map to the category');
  assert.match(js, /sandwichSundaysLink/, 'homepage collection link must be toggled by data');
});

test('stylesheet styles the cover, the card image, and the video embed pattern', () => {
  const css = read('src/style.css');
  for (const sel of ['.detail-cover', '.recipe-card-image', '.recipe-content video', '.hero-collection-link']) {
    assert.ok(css.includes(sel), `stylesheet must style ${sel}`);
  }
  assert.match(css, /max-height:\s*70vh/, 'video must be capped to the viewport');
});

test('media pattern is documented for AI-drafted recipes', () => {
  const doc = read('docs/media-pattern.md');
  assert.match(doc, /\*\*Image:\*\*/, 'cover convention must be documented');
  assert.match(doc, /<video controls playsinline/, 'the build-short embed must be documented');
});
