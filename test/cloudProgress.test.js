import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileStore, readGuestProgress } from '../src/player/profileStore.js';
import { createGameStorage } from '../src/utils/gameStorage.js';
import { decodeSnapshot, emptySnapshot, mergeSnapshots, serializeSnapshot } from '../src/player/progressMerge.js';
import { createSessionScope } from '../src/player/sessionScope.js';

function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values,
    get: async ({ key }) => ({ value: values.get(key) ?? null }),
    set: async ({ key, value }) => values.set(key, value),
    remove: async ({ key }) => values.delete(key),
    keys: async () => ({ keys: [...values.keys()] }) };
}
const profile = (device, time = 100, backing = memoryStore(), uid = 'player') =>
  createProfileStore({ backing, uid, device, now: () => time });

test('guest migration retains original cells, editions, hints, completions and ranks', async () => {
  const backing = memoryStore({ 'puzzle_progress_food-vol1': '["C","","T"]',
    'reward_claimed_food-vol2': 'true', 'puzzle_edition_food-vol1': '"original"',
    'unlocked_hints_food-vol1': '["across-1"]', 'free_hint_claimed_food-vol1': 'true',
    'revealed_indices_food-vol1': '[0]', hint_wallet_v1: '{"balance":9,"receipts":["old-reward"]}',
    journey_rank_high_watermark: '6', 'theme_progress_Food': '{"puzzlesCompleted":4,"completed":false}',
    unrelated_key: 'private', puzzle_dataset_version: 'catalog', bonus_hint_toast_pending: 'true' });
  const before = new Map(backing.values);
  const guest = await readGuestProgress(backing);
  const account = profile('a', 100, backing);
  await account.merge(guest);
  for (const key of Object.keys(guest.records)) assert.equal((await account.get({ key })).value, before.get(key), key);
  assert.equal(guest.records.unrelated_key, undefined);
  assert.equal(guest.records.puzzle_dataset_version, undefined);
  for (const [key, value] of before) assert.equal(backing.values.get(key), value, key);
});

test('the original badge-system theme format imports without losing counts, metadata or guest data', async () => {
  // Shape written by App.jsx in the original badge-system release (76daf9b).
  const legacy = JSON.stringify({ themeId: 'Food & Cooking', puzzlesCompleted: 7, badgeLevel: 3 });
  const backing = memoryStore({ 'theme_progress_Food & Cooking': legacy,
    'reward_claimed_food-vol1': 'true', 'puzzle_progress_food-vol2': '["C","A",""]',
    hint_wallet_v1: '{"balance":9,"receipts":["old-reward"]}', journey_rank_high_watermark: '6' });
  const before = new Map(backing.values);
  const guest = await readGuestProgress(backing);
  const account = profile('a', 100, backing);
  await account.merge(guest);
  const restored = decodeSnapshot(serializeSnapshot(await account.snapshot()));
  assert.deepEqual(JSON.parse(restored.records['theme_progress_Food & Cooking'].value), {
    themeId: 'Food & Cooking', puzzlesCompleted: 7, badgeLevel: 3, completed: false
  });
  assert.equal(restored.records['reward_claimed_food-vol1'].value, 'true');
  assert.equal(restored.records['puzzle_progress_food-vol2'].value, '["C","A",""]');
  assert.equal(JSON.parse(restored.records.hint_wallet_v1.value).balance, 9);
  assert.equal(restored.records.journey_rank_high_watermark.value, '6');
  for (const [key, value] of before) assert.equal(backing.values.get(key), value, key);
});

test('cached accounts normalize old theme records, preserve local-only preferences, and merge higher counts', async () => {
  const old = emptySnapshot();
  old.records.theme_progress_Test = { value: '{"puzzlesCompleted":4,"badgeLevel":2}', stamp: { time: 10, device: 'old' } };
  old.records.local_only = { value: 'keep this device preference', stamp: { time: 10, device: 'old' } };
  const backing = memoryStore({ nc_account_player: JSON.stringify(old) });
  const p = profile('a', 100, backing);
  assert.deepEqual(JSON.parse((await p.get({ key: 'theme_progress_Test' })).value), {
    puzzlesCompleted: 4, badgeLevel: 2, completed: false
  });
  // New writes using the legacy summary format are canonicalized as well.
  await p.set({ key: 'theme_progress_Test', value: '{"puzzlesCompleted":5,"badgeLevel":2}' });
  const other = emptySnapshot();
  other.records.theme_progress_Test = { value: '{"completed":true}', stamp: { time: 200, device: 'other' } };
  await p.merge(other);
  const theme = JSON.parse((await p.get({ key: 'theme_progress_Test' })).value);
  assert.equal(theme.puzzlesCompleted, 5);
  assert.equal(theme.completed, true);
  assert.equal(theme.badgeLevel, 2);
  assert.equal((await p.get({ key: 'local_only' })).value, 'keep this device preference');
  other.records.theme_progress_Test = { value: '{"puzzlesCompleted":2,"badgeLevel":1}', stamp: { time: 300, device: 'stale' } };
  await p.merge(other);
  assert.deepEqual(JSON.parse((await p.get({ key: 'theme_progress_Test' })).value), theme);
});

test('theme migration rejects malformed values and never mutates input snapshots on failure', () => {
  for (const value of [null, [], {}, { puzzlesCompleted: null }, { puzzlesCompleted: '4' },
    { puzzlesCompleted: -1 }, { puzzlesCompleted: 1.5 }, { puzzlesCompleted: 4, completed: 'true' }]) {
    const snapshot = emptySnapshot();
    snapshot.records.theme_progress_Test = { value: JSON.stringify(value), stamp: { time: 10, device: 'a' } };
    assert.throws(() => decodeSnapshot(snapshot), /Invalid saved theme progress/);
  }
  const snapshot = emptySnapshot();
  snapshot.records.theme_progress_Test = { value: '{"puzzlesCompleted":4,"badgeLevel":2}', stamp: { time: 10, device: 'a' } };
  snapshot.records.puzzle_progress_test = { value: '["INVALID"]', stamp: { time: 10, device: 'a' } };
  const before = structuredClone(snapshot);
  assert.throws(() => decodeSnapshot(snapshot), /Invalid saved grid/);
  assert.deepEqual(snapshot, before);
});

test('independent cell edits merge and a deliberate later erasure stays erased', async () => {
  const a = profile('a', 100), b = profile('b', 200);
  await a.set({ key: 'puzzle_progress_test', value: '["C","",""]' });
  await b.merge(await a.snapshot());
  await a.set({ key: 'puzzle_progress_test', value: '["C","A",""]' });
  await b.set({ key: 'puzzle_progress_test', value: '["C","","T"]' });
  const combined = mergeSnapshots(await a.snapshot(), await b.snapshot());
  assert.deepEqual(JSON.parse(combined.records.puzzle_progress_test.value), ['C', 'A', 'T']);
  await b.merge(combined);
  await b.set({ key: 'puzzle_progress_test', value: '["C","", "T"]' });
  const erased = mergeSnapshots(await a.snapshot(), await b.snapshot());
  assert.deepEqual(JSON.parse(erased.records.puzzle_progress_test.value), ['C', '', 'T']);
  assert.equal(serializeSnapshot(mergeSnapshots(await a.snapshot(), await b.snapshot())),
    serializeSnapshot(mergeSnapshots(await b.snapshot(), await a.snapshot())));
});

test('opening an empty grid offline cannot erase older cloud letters on reconnection', async () => {
  const guest = emptySnapshot();
  guest.records.puzzle_progress_test = { value: '["C","A",""]', stamp: { time: 0, device: 'guest-import' } };
  const device = profile('new-device', 500);
  await device.set({ key: 'puzzle_progress_test', value: '["","",""]' });
  const merged = mergeSnapshots(guest, await device.snapshot());
  assert.deepEqual(JSON.parse(merged.records.puzzle_progress_test.value), ['C', 'A', '']);
});

test('simultaneous writes are serialized and failed local saves can be retried', async () => {
  const backing = memoryStore();
  const original = backing.set;
  let fail = true;
  backing.set = async args => { if (fail) { fail = false; throw new Error('Disk full'); } return original(args); };
  const p = profile('a', 100, backing);
  await assert.rejects(p.set({ key: 'reward_claimed_a', value: 'true' }), /Disk full/);
  assert.equal((await p.get({ key: 'reward_claimed_a' })).value, null);
  await Promise.all([p.set({ key: 'reward_claimed_a', value: 'true' }),
    p.set({ key: 'reward_claimed_b', value: 'true' })]);
  assert.equal((await p.get({ key: 'reward_claimed_a' })).value, 'true');
  assert.equal((await p.get({ key: 'reward_claimed_b' })).value, 'true');
});

test('completion and journey ranks cannot regress when an older device reconnects', async () => {
  const a = profile('a'), b = profile('b', 200);
  await a.set({ key: 'reward_claimed_test', value: 'true' });
  await a.set({ key: 'journey_rank_high_watermark', value: '8' });
  await b.set({ key: 'reward_claimed_test', value: 'false' });
  await b.set({ key: 'journey_rank_high_watermark', value: '2' });
  const merged = mergeSnapshots(await a.snapshot(), await b.snapshot());
  assert.equal(merged.records.reward_claimed_test.value, 'true');
  assert.equal(merged.records.journey_rank_high_watermark.value, '8');
});

test('a completed grid survives a later partial save from an offline device', async () => {
  const finished = profile('finished', 100), stale = profile('offline', 500);
  await finished.set({ key: 'puzzle_progress_test', value: '["C","A","T"]' });
  await finished.set({ key: 'reward_claimed_test', value: 'true' });
  await stale.set({ key: 'puzzle_progress_test', value: '["C","X",""]' });
  const merged = mergeSnapshots(await finished.snapshot(), await stale.snapshot());
  assert.equal(merged.records.puzzle_progress_test.value, '["C","A","T"]');
  assert.equal(merged.records.reward_claimed_test.value, 'true');
  assert.equal(serializeSnapshot(merged), serializeSnapshot(mergeSnapshots(await stale.snapshot(), await finished.snapshot())));
});

test('different grid editions stay separate and either saved version can be restored', async () => {
  const a = profile('a'), b = profile('b', 200);
  await a.set({ key: 'puzzle_edition_test', value: '"original"' });
  await a.set({ key: 'puzzle_progress_test', value: '["C","A",""]' });
  await b.set({ key: 'puzzle_edition_test', value: '"editions/test-bbb.json"' });
  await b.set({ key: 'puzzle_progress_test', value: '["D","",""]' });
  const merged = mergeSnapshots(await a.snapshot(), await b.snapshot());
  assert.equal(merged.records.puzzle_progress_test.value, '["C","A",""]');
  assert.equal(merged.archives.test['editions/test-bbb.json'].puzzle_progress_test.value, '["D","",""]');
  await a.merge(merged);
  await a.chooseEdition('test', 'editions/test-bbb.json');
  const restored = await a.snapshot();
  assert.equal(restored.records.puzzle_progress_test.value, '["D","",""]');
  assert.equal(restored.archives.test.original.puzzle_progress_test.value, '["C","A",""]');
  const repeated = mergeSnapshots(restored, merged);
  assert.equal(repeated.records.puzzle_edition_test.value, '"editions/test-bbb.json"');
  assert.equal(repeated.records.puzzle_progress_test.value, '["D","",""]');
});

test('hint spends and rewards combine without duplicating the same reward receipt', async () => {
  const a = profile('a', 100), b = profile('b', 200);
  const ga = createGameStorage(a), gb = createGameStorage(b);
  await ga.awardHints(2, 'puzzle:one');
  await b.merge(await a.snapshot());
  await ga.changeHintsRemaining(-1);
  await gb.changeHintsRemaining(-1);
  await ga.awardHints(3, 'puzzle:two');
  await gb.awardHints(3, 'puzzle:two');
  await a.merge(await b.snapshot());
  assert.equal(await ga.loadHintsRemaining(), 8); // 5 + 2 - 1 - 1 + 3
  const once = serializeSnapshot(await a.snapshot());
  await a.merge(await b.snapshot());
  assert.equal(serializeSnapshot(await a.snapshot()), once);
  assert.equal(await ga.loadHintsRemaining(), 8);
});

test('separate accounts never read or overwrite one another or guest progress', async () => {
  const backing = memoryStore({ puzzle_progress_guest: '["G"]' });
  const a = profile('a', 100, backing, 'alice'), b = profile('b', 200, backing, 'bob');
  await a.set({ key: 'puzzle_progress_test', value: '["A"]' });
  assert.equal((await b.get({ key: 'puzzle_progress_test' })).value, null);
  await b.set({ key: 'puzzle_progress_test', value: '["B"]' });
  assert.equal((await a.get({ key: 'puzzle_progress_test' })).value, '["A"]');
  assert.equal(backing.values.get('puzzle_progress_guest'), '["G"]');
});

test('late writes from a revoked screen cannot undo restored progress', async () => {
  const p = profile('a');
  const scope = createSessionScope(p);
  const pending = scope.set({ key: 'puzzle_progress_test', value: '["A"]' });
  await scope.stop();
  await pending;
  await p.set({ key: 'puzzle_progress_test', value: '["B"]' });
  await scope.set({ key: 'puzzle_progress_test', value: '["A"]' });
  assert.equal((await p.get({ key: 'puzzle_progress_test' })).value, '["B"]');
});

test('damaged cloud data is rejected without erasing a local save', async () => {
  const p = profile('a');
  await p.set({ key: 'puzzle_progress_test', value: '["C"]' });
  const before = await p.snapshot();
  const bad = emptySnapshot();
  bad.records.puzzle_progress_test = { value: '["TOO LONG"]', stamp: { time: 500, device: 'bad' } };
  await assert.rejects(p.merge(bad), /Invalid saved grid/);
  assert.deepEqual(await p.snapshot(), before);
  assert.throws(() => decodeSnapshot({ ...emptySnapshot(), schemaVersion: 2 }), /Unsupported/);
});
