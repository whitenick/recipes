const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('src/main.js imports the cook-attempts module', () => {
  const js = read('src/main.js');
  assert.match(js, /import.*cook-attempts/, 'must import cook-attempts module');
  assert.match(js, /seedDataIfEmpty/, 'must import seedDataIfEmpty');
  assert.match(js, /renderCookAttempts/, 'must import renderCookAttempts');
  assert.match(js, /seedDataIfEmpty\(\)/, 'must call seedDataIfEmpty on init');
  assert.match(js, /renderCookAttempts\(/, 'must call renderCookAttempts in showDetail');
});

test('src/main.js renders the people-edge-section in recipe detail', () => {
  const js = read('src/main.js');
  assert.match(js, /peopleEdgeSection/, 'showDetail must include peopleEdgeSection element');
  assert.match(js, /people-edge-section/, 'the section must have the people-edge-section class');
  assert.match(js, /data-recipe-id/, 'the section must carry a data-recipe-id attribute');
});

test('index.html or main.js wires cook-attempts module', () => {
  const html = read('index.html');
  assert.match(html, /src="\/src\/main\.js"/, 'main.js is loaded as module (contains cook-attempts)');
});

test('src/cook-attempts.js exists and exports expected symbols', () => {
  const js = read('src/cook-attempts.js');
  assert.ok(js.length > 0, 'cook-attempts.js must not be empty');
  assert.match(js, /export\s+\{/, 'must have an export block');
  assert.match(js, /seedDataIfEmpty/, 'must export seedDataIfEmpty');
  assert.match(js, /renderCookAttempts/, 'must export renderCookAttempts');
  assert.match(js, /recordAttempt/, 'must export recordAttempt');
  assert.match(js, /ns-cook-attempts/, 'must reference the ns-cook-attempts localStorage key');
  assert.match(js, /ns-cook-profile/, 'must reference the ns-cook-profile localStorage key');
  assert.match(js, /ns-cook-friends/, 'must reference the ns-cook-friends localStorage key');
  assert.match(js, /ns-cook-places/, 'must reference the ns-cook-places localStorage key');
});

test('localStorage keys follow existing ns- prefix convention', () => {
  const js = read('src/cook-attempts.js');
  assert.match(js, /LS_KEY_ATTEMPTS\s*=\s*'ns-cook-attempts'/, 'attempts key must use ns-cook-attempts');
  assert.match(js, /LS_KEY_PROFILE\s*=\s*'ns-cook-profile'/, 'profile key must use ns-cook-profile');
});

test('people-edge CSS section exists in stylesheet', () => {
  const css = read('src/style.css');
  assert.match(css, /people-edge/, 'stylesheet must contain people-edge rules');
  assert.match(css, /people-edge-section/, 'stylesheet must target people-edge-section');
  assert.match(css, /people-edge-btn/, 'stylesheet must style record buttons');
  assert.match(css, /people-place-overlay/, 'stylesheet must style the place picker overlay');
  assert.match(css, /people-place-modal/, 'stylesheet must style the place picker modal');
});

test('cook-attempts module has demo seed data for immediate visibility', () => {
  const js = read('src/cook-attempts.js');
  assert.match(js, /DEMO_FRIENDS/, 'must define demo friends');
  assert.match(js, /friend-alex/, 'must include friend Alex');
  assert.match(js, /friend-jordan/, 'must include friend Jordan');
  assert.match(js, /friend-sam/, 'must include friend Sam');
  assert.match(js, /demoAttempts/, 'must seed demo cook attempts');
  assert.match(js, /DEFAULT_PLACES/, 'must define default places');
  assert.match(js, /pumpkin-risotto/, 'must seed attempt on a real recipe');
});