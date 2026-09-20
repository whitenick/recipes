const LS_KEY_ATTEMPTS = 'ns-cook-attempts';
const LS_KEY_PROFILE = 'ns-cook-profile';
const LS_KEY_FRIENDS = 'ns-cook-friends';
const LS_KEY_PLACES = 'ns-cook-places';

const DEFAULT_PLACES = [
  { id: 'home', name: 'Home', kind: 'home' },
  { id: 'restaurant', name: 'A restaurant', kind: 'restaurant' },
  { id: 'other', name: 'Another place', kind: 'other' },
];

const DEMO_FRIENDS = [
  { id: 'friend-alex', name: 'Alex' },
  { id: 'friend-jordan', name: 'Jordan' },
  { id: 'friend-sam', name: 'Sam' },
];

const DEMO_USER = { id: 'user-local', name: 'You' };

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getCurrentUser() {
  let user = load(LS_KEY_PROFILE, null);
  if (!user) {
    user = { id: DEMO_USER.id, name: DEMO_USER.name };
    save(LS_KEY_PROFILE, user);
  }
  return user;
}

function getFriendNames() {
  return load(LS_KEY_FRIENDS, []);
}

function isFriend(userId) {
  const user = getCurrentUser();
  const friendships = getFriendNames();
  return friendships.some(
    (f) =>
      (f[0] === user.id && f[1] === userId) ||
      (f[1] === user.id && f[0] === userId)
  );
}

function seedDataIfEmpty() {
  const existing = load(LS_KEY_ATTEMPTS, null);
  if (existing) return;

  const now = Date.now();
  const DAY = 86400000;

  const demoAttempts = [
    { id: uid(), recipe_id: 'pumpkin-risotto-with-sage-brown-butter', user_id: 'friend-alex', kind: 'made', place_id: 'home', note: 'Added extra sage — amazing', created_at: new Date(now - DAY * 3).toISOString() },
    { id: uid(), recipe_id: 'pumpkin-risotto-with-sage-brown-butter', user_id: 'friend-jordan', kind: 'tried', place_id: 'restaurant', note: null, created_at: new Date(now - DAY * 2).toISOString() },
    { id: uid(), recipe_id: 'chicken-tikka-masala', user_id: 'friend-sam', kind: 'made', place_id: 'home', note: null, created_at: new Date(now - DAY * 5).toISOString() },
    { id: uid(), recipe_id: 'chicken-tikka-masala', user_id: 'friend-alex', kind: 'tried', place_id: null, note: null, created_at: new Date(now - DAY).toISOString() },
    { id: uid(), recipe_id: 'classic-burger-recipe', user_id: 'friend-jordan', kind: 'made', place_id: 'home', note: 'Used brioche buns — highly recommend', created_at: new Date(now - DAY * 4).toISOString() },
    { id: uid(), recipe_id: 'classic-burger-recipe', user_id: 'user-local', kind: 'made', place_id: 'home', note: null, created_at: new Date(now - DAY * 7).toISOString() },
    { id: uid(), recipe_id: 'guacamole', user_id: 'friend-sam', kind: 'tried', place_id: 'restaurant', note: 'Best guac I have ever had', created_at: new Date(now - DAY * 6).toISOString() },
    { id: uid(), recipe_id: 'guacamole', user_id: 'friend-sam', kind: 'made', place_id: null, note: null, created_at: new Date(now - DAY).toISOString() },
  ];

  const friendships = DEMO_FRIENDS.map(f => ['user-local', f.id]);

  save(LS_KEY_ATTEMPTS, demoAttempts);
  save(LS_KEY_PLACES, DEFAULT_PLACES);
  save(LS_KEY_FRIENDS, friendships);
}

function getAttemptsForRecipe(recipeId) {
  return load(LS_KEY_ATTEMPTS, []).filter(a => a.recipe_id === recipeId);
}

function getPlace(placeId) {
  if (!placeId) return null;
  const places = load(LS_KEY_PLACES, DEFAULT_PLACES);
  return places.find(p => p.id === placeId) || null;
}

function recordAttempt(recipeId, kind, placeId, note) {
  const user = getCurrentUser();
  let attempts = load(LS_KEY_ATTEMPTS, []);

  const existing = attempts.findIndex(
    a => a.recipe_id === recipeId && a.user_id === user.id && a.kind === kind
  );
  if (existing >= 0) {
    attempts.splice(existing, 1);
  }

  attempts.unshift({
    id: uid(),
    recipe_id: recipeId,
    user_id: user.id,
    kind,
    place_id: placeId || null,
    note: note || null,
    created_at: new Date().toISOString(),
  });

  save(LS_KEY_ATTEMPTS, attempts);
  return attempts.filter(a => a.recipe_id === recipeId);
}

function removeAttempt(attemptId) {
  let attempts = load(LS_KEY_ATTEMPTS, []);
  attempts = attempts.filter(a => a.id !== attemptId);
  save(LS_KEY_ATTEMPTS, attempts);
}

function renderCookAttempts(recipeId, container) {
  const attempts = getAttemptsForRecipe(recipeId);
  const user = getCurrentUser();
  const friendNames = getFriendNames();

  function userName(userId) {
    if (userId === user.id) return 'You';
    const friend = DEMO_FRIENDS.find(f => f.id === userId);
    return friend ? friend.name : 'Someone';
  }

  let html = `<div class="people-edge">
    <div class="people-edge-header">
      <span class="people-edge-title">Who made / tried this</span>
      <span class="people-edge-count">${attempts.length}</span>
    </div>`;

  if (attempts.length === 0) {
    html += `<p class="people-edge-empty">No attempts recorded yet. Be the first!</p>`;
  } else {
    const sorted = [...attempts].sort((a, b) => {
      const as = (a.user_id === user.id ? 0 : isFriend(a.user_id) ? 10 : 20);
      const bs = (b.user_id === user.id ? 0 : isFriend(b.user_id) ? 10 : 20);
      if (as !== bs) return as - bs;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    html += `<div class="people-edge-list">`;
    for (const a of sorted) {
      const name = userName(a.user_id);
      const place = getPlace(a.place_id);
      const kindEmoji = a.kind === 'made' ? '🥘' : '👤';
      html += `<div class="people-edge-item" data-attempt-id="${a.id}">
          <span class="people-edge-item-kind">${kindEmoji}</span>
          <div class="people-edge-item-body">
            <span class="people-edge-item-name">${escHtml(name)}</span>
            ${place ? `<span class="people-edge-item-place">at ${escHtml(place.name)}</span>` : ''}
            ${a.note ? `<span class="people-edge-item-note">${escHtml(a.note)}</span>` : ''}
          </div>
          ${a.user_id === user.id ? `<button class="people-edge-undo" title="Remove">×</button>` : ''}
          <span class="people-edge-item-time">${timeAgo(a.created_at)}</span>
        </div>`;
    }
    html += `</div>`;
  }

  const userMade = attempts.find(a => a.user_id === user.id && a.kind === 'made');
  const userTried = attempts.find(a => a.user_id === user.id && a.kind === 'tried');

  html += `<div class="people-edge-actions">
      <button class="people-edge-btn ${userMade ? 'active' : ''}" data-kind="made">
        ${userMade ? '✓ ' : ''}I made this
      </button>
      <button class="people-edge-btn ${userTried ? 'active' : ''}" data-kind="tried">
        ${userTried ? '✓ ' : ''}I tried this
      </button>
    </div>
  </div>`;

  container.innerHTML = html;

  container.querySelectorAll('.people-edge-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const kind = btn.dataset.kind;
      showPlacePicker((placeId, note) => {
        recordAttempt(recipeId, kind, placeId, note);
        renderCookAttempts(recipeId, container);
      });
    });
  });

  container.querySelectorAll('.people-edge-undo').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.people-edge-item');
      const attemptId = item ? item.dataset.attemptId : null;
      if (attemptId) {
        removeAttempt(attemptId);
        renderCookAttempts(recipeId, container);
      }
    });
  });
}

function showPlacePicker(onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'people-place-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const places = load(LS_KEY_PLACES, DEFAULT_PLACES);

  const box = document.createElement('div');
  box.className = 'people-place-modal';

  let html = `<div class="people-place-header">
    <span>Tag a place (optional)</span>
    <button class="people-place-close">×</button>
  </div>
  <div class="people-place-note-wrap">
    <textarea class="people-place-note-input" placeholder="Add a note (optional)" rows="2"></textarea>
  </div>
  <div class="people-place-options">`;

  for (const p of places) {
    html += `<button class="people-place-opt" data-place-id="${p.id}">${p.name}</button>`;
  }
  html += `<button class="people-place-opt" data-place-id="">No tag</button>`;
  html += `</div>`;

  box.innerHTML = html;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelectorAll('.people-place-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const placeId = btn.dataset.placeId;
      const note = box.querySelector('.people-place-note-input').value.trim();
      overlay.remove();
      onPick(placeId || null, note || null);
    });
  });

  box.querySelector('.people-place-close').addEventListener('click', () => overlay.remove());
}

function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export {
  getCurrentUser,
  getAttemptsForRecipe,
  recordAttempt,
  removeAttempt,
  renderCookAttempts,
  seedDataIfEmpty,
};