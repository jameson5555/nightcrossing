import { cloudSnapshot, decodeSnapshot, emptySnapshot, isSyncedKey, mergeSnapshots,
  serializeSnapshot, walletBase, walletValue } from './progressMerge.js';

export function createProfileStore({ backing, uid, device, now = Date.now, onChange = () => {} }) {
  const storageKey = `nc_account_${encodeURIComponent(uid)}`;
  let current;
  let queue = Promise.resolve();
  const serialized = operation => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const load = async () => {
    if (!current) {
      const { value } = await backing.get({ key: storageKey });
      if (!value) current = emptySnapshot();
      else {
        const saved = JSON.parse(value);
        current = decodeSnapshot(cloudSnapshot(saved));
        current.records = { ...saved.records, ...current.records };
      }
    }
    return current;
  };
  const persist = async next => {
    await backing.set({ key: storageKey, value: JSON.stringify(next) });
    current = next;
  };
  const update = (key, value) => serialized(async () => {
    const state = await load();
    const prior = state.records[key];
    if ((prior?.value ?? null) === value) return;
    const next = structuredClone(state);
    const stamp = { time: Math.max(now(), state.clock + 1), device };
    next.clock = stamp.time;
    const record = { value, stamp };
    if (key.startsWith('puzzle_progress_') && value !== null) {
      const before = prior?.value ? JSON.parse(prior.value) : [];
      const after = JSON.parse(value);
      record.cells = after.map((cell, i) => cell === before[i] || (before[i] === undefined && !cell) ?
        (prior?.cells?.[i] || prior?.stamp || { time: 0, device: '' }) : stamp);
    }
    if (key === 'hint_wallet_v1' && value !== null) {
      const legacy = state.records.global_hints_remaining?.value;
      const previous = prior?.value || JSON.stringify({ balance: legacy ? Math.min(20, Number(legacy)) : 5, receipts: [] });
      const wallet = structuredClone(prior?.wallet || walletBase(previous));
      const before = JSON.parse(previous), after = JSON.parse(value);
      const receipt = after.receipts.find(item => !before.receipts.includes(item));
      const event = { id: receipt ? `reward:${receipt}` : `${device}:${stamp.time}`,
        delta: after.balance - before.balance, stamp, ...(receipt ? { receipt } : {}) };
      if (!wallet.events.some(item => item.id === event.id)) wallet.events.push(event);
      record.wallet = wallet;
      record.value = JSON.stringify(walletValue(wallet));
    }
    next.records[key] = record;
    if (isSyncedKey(key)) {
      const validated = decodeSnapshot(cloudSnapshot(next));
      next.records = { ...next.records, ...validated.records };
      next.clock = validated.clock;
    }
    await persist(next);
    if (isSyncedKey(key)) onChange();
  });
  return {
    uid,
    get: ({ key }) => serialized(async () => ({ value: (await load()).records[key]?.value ?? null })),
    set: ({ key, value }) => update(key, value),
    remove: ({ key }) => update(key, null),
    keys: () => serialized(async () => ({ keys: Object.entries((await load()).records)
      .filter(([, record]) => record.value !== null).map(([key]) => key) })),
    snapshot: () => serialized(async () => structuredClone(await load())),
    merge: remote => serialized(async () => {
      const local = await load();
      const next = mergeSnapshots(local, decodeSnapshot(remote));
      const changed = serializeSnapshot(next) !== serializeSnapshot(local);
      if (changed) await persist(next);
      return changed;
    }),
    chooseEdition: (id, edition) => serialized(async () => {
      const state = await load();
      if (!state.archives[id]?.[edition]) throw new Error('That saved version is unavailable.');
      const next = structuredClone(state);
      const stamp = { time: Math.max(now(), state.clock + 1), device };
      next.clock = stamp.time;
      next.choices[id] = { value: JSON.stringify(edition), stamp };
      const selected = mergeSnapshots(next, emptySnapshot());
      selected.records[`puzzle_edition_${id}`] = { value: JSON.stringify(edition), stamp };
      await persist(selected);
      onChange();
    }),
    clear: () => serialized(async () => { await backing.remove({ key: storageKey }); current = emptySnapshot(); })
  };
}

export async function readGuestProgress(backing) {
  const snapshot = emptySnapshot();
  const { keys } = await backing.keys();
  for (const key of keys.filter(isSyncedKey)) {
    const { value } = await backing.get({ key });
    if (value === null) continue;
    const record = { value, stamp: { time: 0, device: 'guest-import' } };
    if (key === 'hint_wallet_v1') record.wallet = walletBase(value);
    snapshot.records[key] = record;
  }
  if (!snapshot.records.hint_wallet_v1 && snapshot.records.global_hints_remaining) {
    const balance = Math.max(0, Math.min(20, Number(snapshot.records.global_hints_remaining.value)));
    const value = JSON.stringify({ balance, receipts: [] });
    snapshot.records.hint_wallet_v1 = { value, stamp: { time: 0, device: 'guest-import' }, wallet: walletBase(value) };
  }
  return decodeSnapshot(snapshot);
}
