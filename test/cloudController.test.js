import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createCloudController } from '../src/player/cloudController.js';
import { emptySnapshot, mergeSnapshots } from '../src/player/progressMerge.js';
import { getCloudConfig } from '../src/player/config.js';

function harness({ initial = {}, restoredUser = null, restoredOptions } = {}) {
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
    onAuth: callback => { authChanged = callback; callback(restoredUser, restoredOptions); },
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

test('startup reads wait for the restored player and placeholder effects cannot change either save', async () => {
  const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
    nc_guest_progress_owner: 'bob', puzzle_progress_test: '["G"]'
  } });
  const remote = emptySnapshot();
  remote.records.puzzle_progress_test = { value: '["A"]', stamp: { time: 1, device: 'other' } };
  h.saves.set('alice', remote);
  const placeholder = h.controller.getState().scope;
  let readFinished = false;
  const read = placeholder.get({ key: 'puzzle_progress_test' }).then(result => { readFinished = true; return result; });
  const keys = placeholder.keys();
  await placeholder.set({ key: 'puzzle_progress_test', value: '["X"]' });
  assert.equal(readFinished, false);
  assert.equal(h.values.get('puzzle_progress_test'), '["G"]');
  await h.controller.start(); await h.settled();
  assert.equal((await read).value, '["A"]');
  assert.ok((await keys).keys.includes('puzzle_progress_test'));
  await placeholder.set({ key: 'puzzle_progress_test', value: '["X"]' });
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_test' })).value, '["A"]');
  assert.equal(h.values.get('puzzle_progress_test'), '["G"]');
  await h.controller.signOut(); await h.settled();
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

test('a verified redirect sign-in resumes explicit browser import after navigation', async () => {
  const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, restoredOptions: { importGuest: true },
    initial: { nc_guest_progress_owner: 'alice', nc_guest_import_declined_alice: 'true', puzzle_progress_test: '["G"]' } });
  await h.controller.start(); await h.settled();
  assert.equal(h.saves.get('alice').records.puzzle_progress_test.value, '["G"]');
  assert.equal(h.values.get('puzzle_progress_test'), '["G"]');
  assert.equal(h.values.has('nc_guest_import_declined_alice'), false);
  await h.controller.signOut(); await h.settled();
});

test('automatic import never copies another owner’s save or a previously declined guest save', async () => {
  for (const markers of [{ nc_guest_progress_owner: 'bob' },
    { nc_guest_progress_owner: 'alice', nc_guest_import_declined_alice: 'true' }]) {
    const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
      ...markers, puzzle_progress_test: '["G"]'
    } });
    await h.controller.start(); await h.settled();
    assert.equal(h.saves.get('alice').records.puzzle_progress_test, undefined);
    await h.controller.signOut(); await h.settled();
  }
});

test('restoring a session automatically combines browser progress despite an old import marker', async () => {
  for (const markers of [{}, { nc_guest_progress_owner: 'alice', nc_guest_imported_alice: 'true' }]) {
    const initial = { ...markers, puzzle_progress_test: '["G"]', reward_claimed_done: 'true',
      hint_wallet_v1: '{"balance":9,"receipts":[]}' };
    const first = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial });
    await first.controller.start(); await first.settled();
    assert.equal(first.saves.get('alice').records.puzzle_progress_test.value, '["G"]');
    assert.equal(first.saves.get('alice').records.reward_claimed_done.value, 'true');
    const backup = first.values.get('nc_browser_recovery_backup_alice');
    assert.ok(backup);
    const restored = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: Object.fromEntries(first.values) });
    await first.controller.signOut(); await first.settled();
    await restored.controller.start(); await restored.settled();
    assert.equal(JSON.parse(restored.saves.get('alice').records.hint_wallet_v1.value).balance, 9);
    assert.equal(restored.values.get('nc_browser_recovery_backup_alice'), backup);
    assert.equal(restored.values.get('puzzle_progress_test'), '["G"]');
    await restored.controller.signOut(); await restored.settled();
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

test('optional browser recovery can copy a previously declined save and retains both original saves', async () => {
  const guest = { puzzle_progress_test: '["G"]', reward_claimed_done: 'true',
    theme_progress_Food: '{"puzzlesCompleted":7,"badgeLevel":3}',
    hint_wallet_v1: '{"balance":9,"receipts":[]}', journey_rank_high_watermark: '6' };
  const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
    ...guest, nc_guest_progress_owner: 'alice', nc_guest_imported_alice: 'true', nc_guest_import_declined_alice: 'true'
  } });
  await h.controller.start(); await h.settled();
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_test' })).value, null);
  assert.equal((await h.controller.getBrowserSaveRecovery()).available, true);
  assert.equal(JSON.parse(await h.controller.exportBrowserSave()).records.puzzle_progress_test.value, '["G"]');
  await h.controller.getState().scope.set({ key: 'reward_claimed_account', value: 'true' });
  await h.controller.sync();
  const before = JSON.parse(await h.controller.exportSave());
  await h.controller.recoverBrowserSave();
  assert.equal(h.saves.get('alice').records.puzzle_progress_test.value, '["G"]');
  assert.equal(h.saves.get('alice').records.reward_claimed_done.value, 'true');
  assert.equal(h.saves.get('alice').records.reward_claimed_account.value, 'true');
  assert.equal(JSON.parse(h.saves.get('alice').records.hint_wallet_v1.value).balance, 9);
  assert.equal(h.saves.get('alice').records.journey_rank_high_watermark.value, '6');
  const backup = h.values.get('nc_browser_recovery_backup_alice');
  assert.deepEqual(JSON.parse(backup).account, before);
  assert.equal(JSON.parse(backup).guest.records.puzzle_progress_test.value, '["G"]');
  assert.equal((await h.controller.getBrowserSaveRecovery()).available, false);
  await h.controller.recoverBrowserSave();
  assert.equal(h.values.get('nc_browser_recovery_backup_alice'), backup);
  assert.equal(JSON.parse(h.saves.get('alice').records.hint_wallet_v1.value).balance, 9);
  for (const [key, value] of Object.entries(guest)) assert.equal(h.values.get(key), value);
  await h.controller.signOut(); await h.settled();
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_test' })).value, '["G"]');
});

test('explicit checked sign-in can retry an already-marked import without duplicating hints', async () => {
  const h = harness({ initial: { nc_guest_progress_owner: 'alice', nc_guest_imported_alice: 'true',
    puzzle_progress_test: '["G"]', hint_wallet_v1: '{"balance":9,"receipts":[]}' } });
  await h.controller.start(); await h.settled();
  await h.controller.signIn({ importGuest: true }); await h.settled();
  assert.equal(h.saves.get('alice').records.puzzle_progress_test.value, '["G"]');
  await h.controller.signOut(); await h.settled();
  await h.controller.signIn({ importGuest: true }); await h.settled();
  assert.equal(JSON.parse(h.saves.get('alice').records.hint_wallet_v1.value).balance, 9);
  await h.controller.signOut(); await h.settled();
});

test('copying a guest save linked to another account requires explicit recovery confirmation', async () => {
  const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
    nc_guest_progress_owner: 'bob', puzzle_progress_test: '["B"]'
  } });
  await h.controller.start(); await h.settled();
  assert.deepEqual(await h.controller.getBrowserSaveRecovery(), { available: true, differentOwner: true });
  await assert.rejects(h.controller.recoverBrowserSave(), /Confirm that this browser save is yours/);
  assert.equal(h.saves.get('alice').records.puzzle_progress_test, undefined);
  assert.equal(h.values.has('nc_browser_recovery_backup_alice'), false);
  await h.controller.recoverBrowserSave({ allowDifferentOwner: true });
  assert.equal(h.saves.get('alice').records.puzzle_progress_test.value, '["B"]');
  assert.equal(h.values.get('nc_guest_progress_owner'), 'bob');
  assert.equal(h.values.get('puzzle_progress_test'), '["B"]');
  await h.controller.signOut(); await h.settled();
});

test('a failed recovery backup leaves account progress unchanged and restores a writable screen', async () => {
  const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
    nc_guest_progress_owner: 'alice', nc_guest_imported_alice: 'true', nc_guest_import_declined_alice: 'true', puzzle_progress_guest: '["G"]'
  } });
  await h.controller.start(); await h.settled();
  await h.controller.getState().scope.set({ key: 'puzzle_progress_account', value: '["A"]' });
  await h.controller.sync();
  const before = await h.controller.exportSave();
  const write = h.backing.set;
  h.backing.set = async args => {
    if (args.key === 'nc_browser_recovery_backup_alice') throw new Error('Device storage is full.');
    return write(args);
  };
  await assert.rejects(h.controller.recoverBrowserSave(), /Device storage is full/);
  assert.equal(h.controller.getState().phase, 'ready');
  assert.equal(await h.controller.exportSave(), before);
  h.backing.set = write;
  await h.controller.getState().scope.set({ key: 'puzzle_progress_account', value: '["B"]' });
  assert.equal((await h.controller.getState().scope.get({ key: 'puzzle_progress_account' })).value, '["B"]');
  assert.equal(h.values.get('puzzle_progress_guest'), '["G"]');
  await h.controller.signOut(); await h.settled();
});

test('offline recovery retains progress locally until the account can sync again', async () => {
  const h = harness({ restoredUser: { uid: 'alice', email: 'alice@example.test' }, initial: {
    nc_guest_progress_owner: 'alice', nc_guest_imported_alice: 'true', nc_guest_import_declined_alice: 'true', reward_claimed_guest: 'true'
  } });
  await h.controller.start(); await h.settled();
  h.setOffline(true);
  await h.controller.recoverBrowserSave();
  assert.equal(h.controller.getState().cloud, 'error');
  assert.equal((await h.controller.getState().scope.get({ key: 'reward_claimed_guest' })).value, 'true');
  h.setOffline(false);
  await h.controller.sync();
  assert.equal(h.saves.get('alice').records.reward_claimed_guest.value, 'true');
  await h.controller.signOut(); await h.settled();
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
  h.values.set('nc_browser_recovery_backup_alice', 'local backup');
  await h.controller.deleteAccount(); await h.settled();
  assert.equal(h.saves.has('alice'), false);
  assert.equal(h.values.has('nc_account_alice'), false);
  assert.equal(h.values.has('nc_browser_recovery_backup_alice'), false);
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
