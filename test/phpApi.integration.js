import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import net from 'node:net';
import process from 'node:process';
import { emptySnapshot, serializeSnapshot } from '../src/player/progressMerge.js';

let server, origin, directory, endpoint;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function client() {
  let cookie = '', csrf;
  return { cookie: () => cookie, request: async (action, body, query = '') => {
    const response = await fetch(`${endpoint}?action=${action}${query}`, {
      method: body ? 'POST' : 'GET', headers: { Cookie: cookie,
        ...(body ? { Origin: origin, 'Content-Type': 'application/json', 'X-NC-CSRF': csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual'
    });
    for (const value of response.headers.getSetCookie()) if (value.startsWith('nc_session=')) cookie = value.split(';')[0];
    const text = await response.text();
    const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null;
    if (data?.csrf) csrf = data.csrf;
    return { status: response.status, data, text, headers: response.headers };
  }, login: async function (who, reauthenticate = false, uid) {
    await this.request('session');
    const authorization = await this.request('authorize', { reauthenticate, uid });
    assert.equal(authorization.status, 200);
    return this.request('callback', undefined, `&state=${authorization.data.attempt}&code=${who}`);
  } };
}

before(async () => {
  execFileSync('php', ['test/php/prepare.php']);
  directory = await mkdtemp(`${tmpdir()}/nightcrossing-api-`);
  const port = await new Promise(resolve => {
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1', () => { const { port } = socket.address(); socket.close(() => resolve(port)); });
  });
  origin = `http://127.0.0.1:${port}`;
  endpoint = `${origin}/nightcrossing/api/index.php`;
  server = spawn('php', ['-S', `127.0.0.1:${port}`, 'test/php/router.php'], {
    env: { ...process.env, NC_TEST_ORIGIN: origin, NC_TEST_SESSION_DIR: directory }, stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${endpoint}?action=session`); return; } catch { await pause(50); }
  }
  throw new Error('PHP API did not start');
});
after(async () => { server?.kill(); if (directory) await rm(directory, { recursive: true, force: true }); });

const alice = client(), bob = client(), otherAlice = client();
let aliceUid, bobUid;
const payload = serializeSnapshot(emptySnapshot());

test('anonymous saves, foreign origins and missing CSRF are rejected; session cookies are HttpOnly', async () => {
  const session = await alice.request('session');
  assert.equal(session.data.user, null);
  assert.match(session.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(session.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.match(session.headers.get('cache-control'), /no-store/);
  assert.equal((await alice.request('save', undefined, '&uid=someone')).status, 401);
  const invalid = await fetch(`${endpoint}?action=authorize`, { method: 'POST', headers: {
    Origin: 'https://other.test', 'Content-Type': 'application/json', 'X-NC-CSRF': session.data.csrf
  }, body: '{}' });
  assert.equal(invalid.status, 403);
  const absent = await fetch(`${endpoint}?action=authorize`, { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json'
  }, body: '{}' });
  assert.equal(absent.status, 403);
});

test('OAuth state is one-use; sign-in rotates the session and reuses the immutable Google identity', async () => {
  const auth = await alice.request('authorize', {});
  const wrong = await alice.request('callback', undefined, '&state=wrong&code=alice');
  assert.match(wrong.text, /"ok":false/);
  assert.equal((await alice.request('session')).data.user, null);
  const consumed = await alice.request('callback', undefined, `&state=${auth.data.attempt}&code=alice`);
  assert.match(consumed.text, /"ok":false/);
  const signedIn = await alice.login('alice');
  assert.match(signedIn.text, /"ok":true/);
  assert.match(signedIn.headers.get('content-security-policy'), /script-src 'nonce-/);
  aliceUid = (await alice.request('session')).data.user.uid;
  await otherAlice.login('alice');
  assert.equal((await otherAlice.request('session')).data.user.uid, aliceUid);
  await bob.login('bob');
  bobUid = (await bob.request('session')).data.user.uid;
  assert.notEqual(aliceUid, bobUid);
});

test('a late pre-login session check cannot replace the authenticated cookie after repeated sign-ins', async () => {
  const player = client();
  const staleCookies = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await player.request('session');
    const authorization = await player.request('authorize', {});
    const previousCookie = player.cookie();
    staleCookies.push(previousCookie);
    const callback = await player.request('callback', undefined, `&state=${authorization.data.attempt}&code=alice`);
    assert.match(callback.text, /"ok":true/);
    assert.notEqual(player.cookie(), previousCookie, 'login rotates the session ID');
    // A poll may have been sent with the old cookie before the callback rotated
    // it, then arrive late over a mobile connection. Its response must not send
    // another cookie that overwrites the successful login in the browser.
    for (const cookie of staleCookies) {
      const late = await fetch(`${endpoint}?action=session`, { headers: { Cookie: cookie } });
      assert.equal(late.headers.get('set-cookie'), null, 'a delayed poll must not replace the new cookie');
      assert.equal((await late.json()).user, null, 'the old session never gains account access');
    }
    assert.equal((await player.request('session')).data.user.uid, aliceUid);
    staleCookies.push(player.cookie());
    assert.equal((await player.request('logout', {})).status, 200);
  }
});

test('a player cannot read, write or delete another player’s save', async () => {
  assert.equal((await alice.request('save', undefined, `&uid=${bobUid}`)).status, 403);
  assert.equal((await alice.request('write', { uid: bobUid, revision: 0, payload })).status, 403);
  assert.equal((await alice.request('delete', { uid: bobUid })).status, 403);
  assert.equal((await bob.request('save', undefined, `&uid=${bobUid}`)).data.payload, null);
});

test('same-tab sign-in returns only to the game after a verified callback and cancellation has a return link', async () => {
  const player = client();
  await player.request('session');
  const authorization = await player.request('authorize', { redirect: true, returnUrl: 'https://other.test/' });
  assert.equal(authorization.data.mode, 'redirect');
  const callback = await player.request('callback', undefined, `&state=${authorization.data.attempt}&code=alice`);
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), `${origin}/nightcrossing/`);
  const restored = await player.request('session');
  assert.equal(restored.data.user.uid, aliceUid);
  assert.equal(restored.data.loginAttempt, authorization.data.attempt);
  await player.request('logout', {});
  await player.request('session');
  const cancelled = await player.request('authorize', { redirect: true });
  const error = await player.request('callback', undefined, `&state=${cancelled.data.attempt}&error=access_denied`);
  assert.match(error.text, /Google sign-in was cancelled/);
  assert.match(error.text, new RegExp(`href="${origin}/nightcrossing/"`));
  assert.doesNotMatch(error.text, /window.close/);
  assert.equal((await player.request('session')).data.user, null);
});

test('compare-and-swap prevents stale overwrites and rejects malformed or oversized saves', async () => {
  assert.equal((await alice.request('write', { uid: aliceUid, revision: 0, payload })).status, 200);
  assert.equal((await otherAlice.request('write', { uid: aliceUid, revision: 0, payload })).status, 409);
  assert.equal((await alice.request('save', undefined, `&uid=${aliceUid}`)).data.revision, 1);
  for (const bad of ['{}', '{bad', JSON.stringify({ ...emptySnapshot(), schemaVersion: 2 })]) {
    assert.equal((await alice.request('write', { uid: aliceUid, revision: 1, payload: bad })).status, 400);
  }
  assert.equal((await alice.request('write', { uid: aliceUid, revision: 1, payload: 'x'.repeat(750001) })).status, 413);
  assert.equal((await alice.request('save', undefined, `&uid=${aliceUid}`)).data.payload, payload);
});

test('deletion requires a fresh confirmation of the same Google identity and invalidates other sessions', async () => {
  assert.equal((await alice.request('delete', { uid: aliceUid })).status, 403);
  const wrong = await alice.login('bob', true, aliceUid);
  assert.match(wrong.text, /"ok":false/);
  assert.equal((await alice.request('session')).data.user.uid, aliceUid);
  const correct = await alice.login('alice', true, aliceUid);
  assert.match(correct.text, /"ok":true/);
  await alice.request('session'); // CSRF changed during reauthentication.
  assert.equal((await alice.request('delete', { uid: aliceUid })).status, 200);
  assert.equal((await otherAlice.request('save', undefined, `&uid=${aliceUid}`)).status, 401);
  assert.equal((await bob.request('save', undefined, `&uid=${bobUid}`)).status, 200);
  await alice.login('alice');
  const freshUid = (await alice.request('session')).data.user.uid;
  assert.notEqual(freshUid, aliceUid);
  assert.equal((await alice.request('save', undefined, `&uid=${freshUid}`)).data.payload, null);
});
