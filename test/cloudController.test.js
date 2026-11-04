import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createCloudController } from '../src/player/cloudController.js';
import { emptySnapshot, mergeSnapshots } from '../src/player/progressMerge.js';
import { getCloudConfig } from '../src/player/config.js';

function harness({ initial = {}, restoredUser = null } = {}) {
  const values = new Map(Object.entries(initial));
  const backing = {
    get: async ({ key }) => ({ value: values.get(key) ?? null }),
    set: async ({ key, value }) => values.set(key, value),
    remove: async ({ key }) => values.delete(key), keys: async () => ({ keys: [...values.keys()] })
  };
  const saves = new Map();
  let authChanged;
  let signInUser = { uid: 'alice', email: 'alice@example.test' };
  let offline = false;
  const backend = {
    onAuth: callback => { authChanged = callback; callback(restoredUser); },
    signIn: async () => authChanged(signInUser), signOut: async () => authChanged(null),
    merge: async (uid, local) => {
      if (offline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const merged = mergeSnapshots(saves.get(uid) || emptySnapshot(), local);
      saves.set(uid, merged);
      return merged;
    },
    deleteAccount: async uid => { saves.delete(uid); authChanged(null); }
  };
  const controller = createCloudController({ backing, config: { enabled: true, configured: true },
    backendFactory: async () => backend, device: 'test-device', debounceMs: 60000, maxWaitMs: 60000 });
  const settled = async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setImmediate(resolve));
      if (controller.getState().phase === 'ready') return;
    }
    throw new Error('Account transition did not settle');
  };
  return { controller, backing, values, saves, settled,
    setOffline: value => { offline = value; },
    setUser: user => { signInUser = user; } };
}

test('optional PHP configuration leaves guests available, rejects foreign URLs, and disables native accounts', () => {
  assert.equal(getCloudConfig({}).enabled, false);
  assert.equal(getCloudConfig({ VITE_CLOUD_SAVE_ENABLED: 'true' }, true).enabled, false);
  assert.equal(getCloudConfig({ VITE_CLOUD_SAVE_ENABLED: 'true' }).configured, true);
  assert.equal(getCloudConfig({ VITE_CLOUD_SAVE_ENABLED: 'true', VITE_ACCOUNTS_API_PATH: 'https://other.test/api.php' }).configured, false);
});

test('first sign-in imports guest progress once; a second account receives none of it', async () => {
  const h = harness();
  h.values.set('puzzle_progress_test', '["G"]');
  await h.controller.start(); await h.settled();
  await h.controller.signIn(); await h.settled();
  assert.equal(h.saves.get('alice').records.puzzle_progress_test.value, '["G"]');
  assert.equal(h.values.get('puzzle_progress_test'), '["G"]');
  await h.controller.signOut(); await h.settled();
  h.setUser({ uid: 'bob', email: 'bob@example.test' });
  await h.controller.signIn(); await h.settled();
  assert.equal(h.saves.get('bob').records.puzzle_progress_test, undefined);
  await h.controller.signOut(); await h.settled();
});

test('auth restoration resumes an interrupted import of legacy theme progress for the reserved owner', async () => {
  const legacy = '{"themeId":"Food","puzzlesCompleted":7,"badgeLevel":3}';
  const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
    nc_guest_progress_owner: 'alice', theme_progress_Food: legacy,
    puzzle_progress_test: '["G"]', reward_claimed_done: 'true',
    hint_wallet_v1: '{"balance":9,"receipts":[]}'
  } });
  await h.controller.start(); await h.settled();
  assert.equal(h.controller.getState().phase, 'ready');
  assert.deepEqual(JSON.parse(h.saves.get('alice').records.theme_progress_Food.value), {
    themeId: 'Food', puzzlesCompleted: 7, badgeLevel: 3, completed: false
  });
  assert.equal(h.saves.get('alice').records.puzzle_progress_test.value, '["G"]');
  assert.equal(h.saves.get('alice').records.reward_claimed_done.value, 'true');
  assert.equal(JSON.parse(h.saves.get('alice').records.hint_wallet_v1.value).balance, 9);
  assert.equal(h.values.get('nc_guest_imported_alice'), 'true');
  assert.equal(h.values.get('theme_progress_Food'), legacy);
  await h.controller.signOut(); await h.settled();
});

test('interrupted import recovery never copies another owner’s save or an already imported guest save', async () => {
  for (const markers of [{ nc_guest_progress_owner: 'bob' },
    { nc_guest_progress_owner: 'alice', nc_guest_imported_alice: 'true' }]) {
    const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
      ...markers, puzzle_progress_test: '["G"]'
    } });
    await h.controller.start(); await h.settled();
    assert.equal(h.saves.get('alice').records.puzzle_progress_test, undefined);
    await h.controller.signOut(); await h.settled();
  }
});

test('declining a pending import survives reload and a later explicit opt-in can still complete it', async () => {
  const first = harness({ initial: { nc_guest_progress_owner: 'alice', puzzle_progress_test: '["G"]' } });
  await first.controller.start(); await first.settled();
  await first.controller.signIn({ importGuest: false }); await first.settled();
  assert.equal(first.saves.get('alice').records.puzzle_progress_test, undefined);
  assert.equal(first.values.get('nc_guest_import_declined_alice'), 'true');
  const restored = harness({ initial: Object.fromEntries(first.values), restoredUser: { uid: 'alice', email: 'alice@example.test' } });
  await first.controller.signOut(); await first.settled();
  await restored.controller.start(); await restored.settled();
  assert.equal(restored.saves.get('alice').records.puzzle_progress_test, undefined);
  await restored.controller.signOut(); await restored.settled();
  await restored.controller.signIn({ importGuest: true }); await restored.settled();
  assert.equal(restored.saves.get('alice').records.puzzle_progress_test.value, '["G"]');
  assert.equal(restored.values.has('nc_guest_import_declined_alice'), false);
  await restored.controller.signOut(); await restored.settled();
});

test('offline changes remain local and sync successfully after reconnection', async () => {
  const h = harness();
  await h.controller.start(); await h.settled();
  h.setOffline(true);
  await h.controller.signIn(); await h.settled();
  assert.equal(h.controller.getState().cloud, 'error');
  await h.controller.getState().scope.set({ key: 'puzzle_progress_test', value: '["C"]' });
  await h.controller.sync();
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_test' })).value, '["C"]');
  h.setOffline(false);
  await h.controller.sync();
  assert.equal(h.saves.get('alice').records.puzzle_progress_test.value, '["C"]');
  assert.equal(h.controller.getState().cloud, 'saved');
  await h.controller.signOut(); await h.settled();
});

test('remote changes wait for the menu and an old screen cannot write after a refresh', async () => {
  const h = harness();
  await h.controller.start(); await h.settled();
  await h.controller.signIn({ importGuest: false }); await h.settled();
  const old = h.controller.getState().scope;
  await old.set({ key: 'puzzle_progress_test', value: '["C", ""]' });
  await h.controller.sync();
  await h.controller.setPlaying(true);
  h.saves.get('alice').records.puzzle_progress_test = {
    value: '["C","A"]', stamp: { time: Date.now() + 10000, device: 'other' },
    cells: [{ time: 1, device: 'other' }, { time: Date.now() + 10000, device: 'other' }]
  };
  await h.controller.sync();
  assert.deepEqual(JSON.parse((await old.get({ key: 'puzzle_progress_test' })).value), ['C', '']);
  await h.controller.setPlaying(false);
  await h.controller.sync();
  const refreshed = h.controller.getState().scope;
  assert.equal((await refreshed.get({ key: 'puzzle_progress_test' })).value, '["C","A"]');
  await old.set({ key: 'puzzle_progress_test', value: '["X", ""]' });
  assert.equal((await refreshed.get({ key: 'puzzle_progress_test' })).value, '["C","A"]');
  await h.controller.signOut(); await h.settled();
});

test('sign-out restores separate guest progress and deletion removes account cache', async () => {
  const h = harness();
  h.values.set('puzzle_progress_test', '["G"]');
  await h.controller.start(); await h.settled();
  await h.controller.signIn(); await h.settled();
  await h.controller.getState().scope.set({ key: 'puzzle_progress_other', value: '["A"]' });
  await h.controller.sync();
  await h.controller.signOut(); await h.settled();
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_other' })).value, null);
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_test' })).value, '["G"]');
  await h.controller.signIn(); await h.settled();
  await h.controller.deleteAccount(); await h.settled();
  assert.equal(h.saves.has('alice'), false);
  assert.equal(h.values.has('nc_account_alice'), false);
  assert.equal(h.values.get('puzzle_progress_test'), '["G"]');
});

test('a failed cloud restore leaves a writable local scope for recovery', async () => {
  const h = harness();
  await h.controller.start(); await h.settled();
  await h.controller.signIn(); await h.settled();
  const write = h.backing.set;
  h.backing.set = async args => {
    if (args.key === 'nc_account_alice') throw new Error('Device storage is full.');
    return write(args);
  };
  h.saves.get('alice').records.puzzle_progress_test = {
    value: '["A"]', stamp: { time: 100, device: 'remote' }, cells: [{ time: 100, device: 'remote' }]
  };
  await h.controller.sync();
  assert.equal(h.controller.getState().cloud, 'error');
  h.backing.set = write;
  await h.controller.getState().scope.set({ key: 'puzzle_progress_test', value: '["B"]' });
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_test' })).value, '["B"]');
  await h.controller.signOut(); await h.settled();
});
