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

test('only a verified redirect reports its server-confirmed signup or login; restoring a session does not', async () => {
  for (const authEvent of ['sign_up', 'login', undefined]) {
    const cache = memory(), events = [];
    const options = { cache, onSignIn: (event, attempt) => events.push({ event, attempt }),
      fetcher: async () => response({ user: alice, csrf: 'csrf', loginAttempt: 'attempt', authEvent }) };
    await start(createPhpBackend({ endpoint: '/api/index.php' }, options));
    assert.deepEqual(events, [], 'ordinary session restoration is not a login');
    cache.setItem('nc_php_user_v1:/api/index.php:redirect', JSON.stringify({ attempt: 'wrong', created: Date.now() }));
    await start(createPhpBackend({ endpoint: '/api/index.php' }, options));
    assert.deepEqual(events, [], 'a mismatched receipt is not a login');
    cache.setItem('nc_php_user_v1:/api/index.php:redirect', JSON.stringify({ attempt: 'attempt', created: Date.now() }));
    await start(createPhpBackend({ endpoint: '/api/index.php' }, options));
    assert.deepEqual(events, [{ event: authEvent || null, attempt: 'attempt' }]);
    await start(createPhpBackend({ endpoint: '/api/index.php' }, options));
    assert.equal(events.length, 1, 'a consumed redirect is not reported on reload');
  }
});

test('analytics errors cannot prevent a confirmed account from being restored', async () => {
  const cache = memory();
  cache.setItem('nc_php_user_v1:/api/index.php:redirect', JSON.stringify({ attempt: 'attempt', created: Date.now() }));
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache,
    onSignIn: () => { throw new Error('blocked analytics'); },
    fetcher: async () => response({ user: alice, csrf: 'csrf', loginAttempt: 'attempt', authEvent: 'sign_up' }) });
  assert.deepEqual(await start(backend), alice);
});

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

test('normal sign-in leaves and returns in the same tab, clears signed-out preference and resumes the matching import', async () => {
  const cache = memory(), navigations = [];
  const config = { endpoint: '/api/index.php' };
  cache.setItem('nc_php_user_v1:/api/index.php:guest', 'true');
  const browser = { location: { assign: url => navigations.push(url) }, open: () => assert.fail('normal sign-in must not open a popup') };
  const backend = createPhpBackend(config, { browser, cache, fetcher: async (url, options) => {
    if (url.includes('action=session')) return response({ user: null, csrf: 'csrf', loginAttempt: null });
    assert.deepEqual(JSON.parse(options.body), { reauthenticate: false, redirect: true });
    return response({ url: 'https://accounts.google.com/authorize', attempt: 'attempt-redirect', mode: 'redirect' });
  } });
  assert.equal(await start(backend), null);
  await backend.signIn();
  assert.deepEqual(navigations, ['https://accounts.google.com/authorize']);
  assert.equal(cache.getItem('nc_php_user_v1:/api/index.php:guest'), null);
  const restored = createPhpBackend(config, { cache, fetcher: async () => response({ user: alice, csrf: 'csrf', loginAttempt: 'attempt-redirect' }) });
  const result = await new Promise((resolve, reject) => restored.onAuth((user, options) => resolve({ user, options }), reject));
  assert.deepEqual(result, { user: alice, options: { importGuest: true } });
  assert.equal(cache.getItem('nc_php_user_v1:/api/index.php:redirect'), null);
});

test('a stale redirect import intent cannot opt another login into a previously declined import', async () => {
  const cache = memory();
  cache.setItem('nc_php_user_v1:/api/index.php:redirect', JSON.stringify({ attempt: 'old-attempt', created: Date.now() }));
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache,
    fetcher: async () => response({ user: alice, csrf: 'csrf', loginAttempt: 'different-attempt' }) });
  const result = await new Promise((resolve, reject) => backend.onAuth((user, options) => resolve({ user, options }), reject));
  assert.deepEqual(result, { user: alice, options: { importGuest: false } });
});

test('returning to the existing guest page recognizes a completed redirect without reloading or opening Google again', async () => {
  const cache = memory(), navigations = [], updates = [];
  let remoteUser = null, attempt = null;
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache,
    browser: { location: { assign: url => navigations.push(url) } }, fetcher: async url => {
      if (url.includes('action=session')) return response({ user: remoteUser, csrf: 'csrf', loginAttempt: attempt });
      return response({ url: 'https://accounts.google.com/authorize', attempt: 'returned-attempt', mode: 'redirect' });
    } });
  await new Promise((resolve, reject) => backend.onAuth((user, options) => { updates.push({ user, options }); resolve(); }, reject));
  await backend.signIn();
  assert.equal(updates.at(-1).user, null);
  remoteUser = alice; attempt = 'returned-attempt';
  // Another document can already have consumed the shared import ticket while
  // this original page was frozen in browser history.
  cache.removeItem('nc_php_user_v1:/api/index.php:redirect');
  assert.equal(await backend.resumeSignIn(), true);
  assert.deepEqual(updates.at(-1), { user: alice, options: { importGuest: true } });
  assert.equal(updates.length, 2);
  assert.equal(await backend.resumeSignIn(), false);
  assert.equal(updates.length, 2, 'repeated visibility events do not reimport or remount');
  assert.deepEqual(navigations, ['https://accounts.google.com/authorize']);
});

test('an unfinished redirect survives a guest restore and offline return until its exact server receipt arrives', async () => {
  const cache = memory(), key = 'nc_php_user_v1:/api/index.php:redirect';
  cache.setItem(key, JSON.stringify({ attempt: 'pending-attempt', created: Date.now() }));
  let offline = false, remoteUser = null, attempt = null;
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache, fetcher: async () => {
    if (offline) throw new TypeError('offline');
    return response({ user: remoteUser, csrf: 'csrf', loginAttempt: attempt });
  } });
  assert.equal(await start(backend), null);
  assert.ok(cache.getItem(key));
  offline = true;
  assert.equal(await backend.resumeSignIn(), false);
  assert.ok(cache.getItem(key));
  offline = false; remoteUser = alice; attempt = 'another-attempt';
  assert.equal(await backend.resumeSignIn(), false);
  assert.ok(cache.getItem(key));
  attempt = 'pending-attempt';
  assert.equal(await backend.resumeSignIn(), true);
  assert.equal(cache.getItem(key), null);
});

test('sign-out invalidates a pending return check before its delayed session response arrives', async () => {
  const cache = memory(), updates = [];
  let holdNext = false, finishCheck;
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache, fetcher: async url => {
    if (url.includes('action=session')) {
      if (holdNext) { holdNext = false; return new Promise(resolve => { finishCheck = resolve; }); }
      return response({ user: null, csrf: 'csrf' });
    }
    return response({ ok: true });
  } });
  await new Promise((resolve, reject) => backend.onAuth(user => { updates.push(user); resolve(); }, reject));
  cache.setItem('nc_php_user_v1:/api/index.php:redirect', JSON.stringify({ attempt: 'pending-attempt', created: Date.now() }));
  holdNext = true;
  const returning = backend.resumeSignIn();
  assert.equal(await backend.resumeSignIn(), false, 'overlapping return events share one check');
  await backend.signOut();
  finishCheck(response({ user: alice, csrf: 'csrf', loginAttempt: 'pending-attempt' }));
  assert.equal(await returning, false);
  assert.deepEqual(updates, [null, null]);
});

test('a guest preference set in another tab prevents an old page from resuming its remembered login', async () => {
  const cache = memory(), updates = [];
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache,
    browser: { location: { assign: () => {} } }, fetcher: async url => response(url.includes('action=session') ?
      { user: null, csrf: 'csrf' } : { url: 'https://accounts.google.com/authorize', attempt: 'attempt', mode: 'redirect' }) });
  await new Promise((resolve, reject) => backend.onAuth(user => { updates.push(user); resolve(); }, reject));
  await backend.signIn();
  cache.removeItem('nc_php_user_v1:/api/index.php:redirect');
  cache.setItem('nc_php_user_v1:/api/index.php:guest', 'true');
  assert.equal(await backend.resumeSignIn(), false);
  assert.deepEqual(updates, [null]);
});

test('cancelling redirect preparation keeps the game open even when the network response arrives later', async () => {
  const cache = memory();
  cache.setItem('nc_php_user_v1:/api/index.php:guest', 'true');
  let finishSession;
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache,
    browser: { location: { assign: () => assert.fail('cancelled sign-in must not navigate') } },
    fetcher: () => new Promise(resolve => { finishSession = resolve; }) });
  await start(backend);
  const operation = backend.signIn();
  backend.cancelSignIn();
  await assert.rejects(operation, { code: 'popup-closed' });
  finishSession(response({ user: null, csrf: 'csrf' }));
  await Promise.resolve();
  assert.equal(cache.getItem('nc_php_user_v1:/api/index.php:guest'), 'true');
  assert.equal(cache.getItem('nc_php_user_v1:/api/index.php:redirect'), null);
});

test('unsupported servers and foreign authorization URLs leave the game and browser save intact', async () => {
  for (const authorization of [
    { url: 'https://accounts.google.com/authorize', attempt: 'attempt' },
    { url: 'https://other.test/', attempt: 'attempt', mode: 'redirect' }
  ]) {
    const cache = memory();
    cache.setItem('nc_php_user_v1:/api/index.php:guest', 'true');
    const backend = createPhpBackend({ endpoint: '/api/index.php' }, { cache,
      browser: { location: { assign: () => assert.fail('invalid authorization must not navigate') } },
      fetcher: async url => response(url.includes('action=session') ? { user: null, csrf: 'csrf' } : authorization) });
    await start(backend);
    await assert.rejects(backend.signIn(), /could not be started/);
    assert.equal(cache.getItem('nc_php_user_v1:/api/index.php:guest'), 'true');
    assert.equal(cache.getItem('nc_php_user_v1:/api/index.php:redirect'), null);
  }
});

test('popup results require the correct window, origin and a completed matching authorization attempt', async () => {
  let listener, remoteUser = null, completedAttempt = null, opened = 0;
  const popupWindow = { closed: false, close() { this.closed = true; }, location: {} };
  const browser = { location: { origin: 'https://game.test' },
    open: () => { opened++; popupWindow.closed = false; return popupWindow; },
    addEventListener: (name, callback) => { if (name === 'message') listener = callback; },
    removeEventListener: name => { if (name === 'message') listener = null; } };
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { browser, cache: memory(), fetcher: async url => {
    if (url.includes('action=session')) return response({ user: remoteUser, csrf: 'csrf', loginAttempt: completedAttempt });
    return response({ url: 'https://accounts.google.com/authorize', attempt: 'attempt-1' });
  } });
  await start(backend);
  const operation = backend.signIn({ mode: 'popup' });
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

test('a popup message cannot import a stale existing session and cancellation stays available', async () => {
  let listener;
  const popupWindow = { closed: false, close() { this.closed = true; }, location: {} };
  const browser = { location: { origin: 'https://game.test' }, open: () => popupWindow,
    addEventListener: (name, callback) => { if (name === 'message') listener = callback; }, removeEventListener: () => {} };
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { browser, cache: memory(), fetcher: async url =>
    response(url.includes('action=session') ? { user: alice, csrf: 'csrf', loginAttempt: 'old-attempt' } :
      { url: 'https://accounts.google.com/authorize', attempt: 'new-attempt' }) });
  await start(backend);
  const operation = backend.signIn({ mode: 'popup' });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  listener({ origin: browser.location.origin, source: popupWindow, data: { type: 'nightcrossing-auth', ok: true } });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  backend.cancelSignIn();
  await assert.rejects(operation, { code: 'popup-closed' });
});

function detachedPopupHarness({ timeout = 1000, poll = 5 } = {}) {
  const events = new Map(), documentEvents = new Map();
  let currentUser = null, attempt = null, reads = 0, closes = 0;
  const popupWindow = { location: {}, close: () => { closes++; },
    get closed() { throw new Error('Cross-Origin-Opener-Policy prevents reading window.closed'); } };
  const browser = { location: { origin: 'https://game.test' }, open: () => popupWindow,
    addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name),
    document: { addEventListener: (name, callback) => documentEvents.set(name, callback),
      removeEventListener: name => documentEvents.delete(name) } };
  const backend = createPhpBackend({ endpoint: '/api/index.php' }, { browser, cache: memory(),
    completionPollMs: poll, signInTimeoutMs: timeout, fetcher: async url => {
      if (url.includes('action=session')) {
        reads++;
        return response({ user: currentUser, csrf: 'csrf', loginAttempt: attempt });
      }
      return response({ url: 'https://accounts.google.com/authorize', attempt: 'new-attempt' });
    } });
  return { backend, popupWindow, events, documentEvents, reads: () => reads, closes: () => closes,
    complete: () => { currentUser = alice; attempt = 'new-attempt'; } };
}

test('a detached mobile popup completes through the verified server session without a message or closing', async () => {
  const h = detachedPopupHarness();
  await start(h.backend);
  const operation = h.backend.signIn({ mode: 'popup' });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.popupWindow.location.href, 'https://accounts.google.com/authorize');
  assert.equal(h.closes(), 0, 'do not close the Google tab before its callback completes');
  h.complete();
  await operation;
  assert.equal(h.closes(), 1);
  assert.equal(h.events.size, 0);
  assert.equal(h.documentEvents.size, 0);
  assert.equal(h.backend.cancelSignIn(), undefined);
});

test('returning to a mobile tab immediately checks completion even when background timers are suspended', async () => {
  const h = detachedPopupHarness({ poll: 60000 });
  await start(h.backend);
  const operation = h.backend.signIn({ mode: 'popup' });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  h.complete();
  await h.documentEvents.get('visibilitychange')();
  await operation;
  assert.equal(h.events.size, 0);
});

test('an unfinished mobile sign-in times out with a recovery message and releases its timers/listeners', async () => {
  const h = detachedPopupHarness({ timeout: 30 });
  await start(h.backend);
  await assert.rejects(h.backend.signIn({ mode: 'popup' }), { code: 'popup-timeout' });
  assert.equal(h.events.size, 0);
  assert.equal(h.documentEvents.size, 0);
  const reads = h.reads();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(h.reads(), reads);
});
