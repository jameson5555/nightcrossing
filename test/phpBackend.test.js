import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhpBackend } from '../src/player/phpBackend.js';
import { emptySnapshot, serializeSnapshot } from '../src/player/progressMerge.js';

const uid = `g_${'a'.repeat(32)}`;
const alice = { uid, email: 'alice@example.test', displayName: 'Alice' };
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const snapshot = (letters, device) => ({ ...emptySnapshot(), clock: 10, records: {
  puzzle_progress_test: { value: JSON.stringify(letters), stamp: { time: 10, device },
    cells: letters.map(letter => ({ time: letter ? 10 : 0, device: letter ? device : '' })) }
} });
const start = backend => new Promise((resolve, reject) => backend.onAuth(resolve, reject));

test('PHP adapter retries a stale revision and preserves both devices’ letters', async () => {
  let reads = 0, writes = 0;
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache: memory(), fetcher: async (url, options) => {
    assert.equal(options.credentials, 'same-origin');
    if (url.includes('action=session')) return response({ user: alice, csrf: 'csrf' });
    if (url.includes('action=save')) return response({ revision: ++reads, payload: reads === 1 ? null : serializeSnapshot(snapshot(['', 'B'], 'remote')) });
    const body = JSON.parse(options.body);
    assert.equal(options.headers['X-NC-CSRF'], 'csrf');
    assert.equal(body.uid, uid);
    if (++writes === 1) return response({ error: 'conflict' }, 409);
    assert.equal(body.revision, 2);
    return response({ revision: 3 });
  } });
  await start(backend);
  const merged = await backend.merge(uid, snapshot(['A', ''], 'local'));
  assert.deepEqual(JSON.parse(merged.records.puzzle_progress_test.value), ['A', 'B']);
  assert.equal(writes, 2);
});

test('damaged server saves and wrong account IDs cannot overwrite local progress', async () => {
  let writes = 0;
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache: memory(), fetcher: async url => {
    if (url.includes('action=session')) return response({ user: alice, csrf: 'csrf' });
    if (url.includes('action=save')) return response({ revision: 1, payload: '{bad json' });
    writes++; return response({});
  } });
  await start(backend);
  await assert.rejects(backend.merge(uid, emptySnapshot()));
  await assert.rejects(backend.merge('other', emptySnapshot()));
  assert.equal(writes, 0);
});

test('offline reload restores only a cached profile hint; offline sign-out stays guest on reload', async () => {
  const cache = memory();
  const config = { endpoint: '/api/index.php' };
  const first = createPhpBackend(config, { cache, fetcher: async () => response({ user: alice, csrf: 'csrf' }) });
  await start(first);
  const offline = () => { throw new TypeError('offline'); };
  const second = createPhpBackend(config, { cache, fetcher: offline });
  assert.deepEqual(await start(second), alice);
  await assert.rejects(second.merge(uid, emptySnapshot()), { code: 'unavailable' });
  await second.signOut();
  const third = createPhpBackend(config, { cache, fetcher: offline });
  assert.equal(await start(third), null);
});

test('popup results require the correct window, origin and a completed matching authorization attempt', async () => {
  let listener, remoteUser = null, completedAttempt = null, opened = 0;
  const popupWindow = { closed: false, close() { this.closed = true; }, location: {} };
  const browser = { location: { origin: 'https://game.test' },
    open: () => { opened++; popupWindow.closed = false; return popupWindow; },
    addEventListener: (name, callback) => { listener = callback; }, removeEventListener: () => { listener = null; } };
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { browser, cache: memory(), fetcher: async url => {
    if (url.includes('action=session')) return response({ user: remoteUser, csrf: 'csrf', loginAttempt: completedAttempt });
    return response({ url: 'https://accounts.google.com/authorize', attempt: 'attempt-1' });
  } });
  await start(backend);
  const operation = backend.signIn();
  assert.equal(opened, 1, 'popup opens before asynchronous work');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  listener({ origin: 'https://wrong.test', source: popupWindow, data: { type: 'nightcrossing-auth', ok: true } });
  assert.ok(listener, 'wrong origin ignored');
  listener({ origin: browser.location.origin, source: {}, data: { type: 'nightcrossing-auth', ok: true } });
  assert.ok(listener, 'wrong window ignored');
  remoteUser = alice; completedAttempt = 'attempt-1';
  listener({ origin: browser.location.origin, source: popupWindow, data: { type: 'nightcrossing-auth', ok: true } });
  await operation;
  assert.equal(listener, null);
});

test('closing a cancelled popup cannot import into an already existing server session', async () => {
  let listener;
  const popupWindow = { closed: false, close() { this.closed = true; }, location: {} };
  const browser = { location: { origin: 'https://game.test' }, open: () => popupWindow,
    addEventListener: (name, callback) => { listener = callback; }, removeEventListener: () => {} };
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { browser, cache: memory(), fetcher: async url =>
    response(url.includes('action=session') ? { user: alice, csrf: 'csrf', loginAttempt: 'old-attempt' } :
      { url: 'https://accounts.google.com/authorize', attempt: 'new-attempt' }) });
  await start(backend);
  const operation = backend.signIn();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  listener({ origin: browser.location.origin, source: popupWindow, data: { type: 'nightcrossing-auth', ok: true } });
  await assert.rejects(operation, { code: 'popup-closed' });
});
