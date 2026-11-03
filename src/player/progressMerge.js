const PUZZLE_PREFIXES = ['puzzle_progress_', 'puzzle_edition_', 'unlocked_hints_',
  'revealed_indices_', 'reward_claimed_', 'free_hint_claimed_'];
const FIXED_KEYS = new Set(['hint_wallet_v1', 'global_hints_remaining',
  'journey_rank_high_watermark', 'hints_empty_timestamp',
  'bonus_hints_awarded_since_empty', 'free_hint_toast_seen']);
export const emptySnapshot = () => ({ schemaVersion: 1, clock: 0, records: {}, archives: {}, choices: {} });
export const puzzleIdForKey = key => PUZZLE_PREFIXES.find(prefix => key.startsWith(prefix))
  ? key.slice(PUZZLE_PREFIXES.find(prefix => key.startsWith(prefix)).length) : null;
export const isSyncedKey = key => FIXED_KEYS.has(key) ||
  /^theme_progress_.{1,100}$/.test(key) ||
  (puzzleIdForKey(key) !== null && /^[a-z0-9-]{1,150}$/.test(puzzleIdForKey(key)));
export const parseValue = record => record?.value == null ? null : JSON.parse(record.value);
const zero = { time: 0, device: '' };
export const compareStamps = (a = zero, b = zero) =>
  a.time - b.time || a.device.localeCompare(b.device);
const newer = (a, b) => !a ? b : !b ? a :
  (compareStamps(a.stamp, b.stamp) || String(a.value).localeCompare(String(b.value))) >= 0 ? a : b;
const list = record => parseValue(record) || [];
const union = (a, b) => [...new Set([...a, ...b])].sort((x, y) => String(x).localeCompare(String(y)));

export function walletValue(wallet) {
  let balance = wallet.base;
  const receipts = new Set(wallet.receipts);
  for (const event of [...wallet.events].sort((a, b) => compareStamps(a.stamp, b.stamp) || a.id.localeCompare(b.id))) {
    if (event.receipt && receipts.has(event.receipt)) continue;
    balance = Math.max(0, Math.min(20, balance + event.delta));
    if (event.receipt) receipts.add(event.receipt);
  }
  return { balance, receipts: [...receipts].slice(-512) };
}

export function walletBase(value) {
  const parsed = value ? JSON.parse(value) : { balance: 5, receipts: [] };
  return { base: Math.max(0, Math.min(20, parsed.balance)), receipts: parsed.receipts || [], events: [] };
}

function mergeWallet(a, b) {
  const left = a.wallet || walletBase(a.value);
  const right = b.wallet || walletBase(b.value);
  const events = new Map();
  for (const event of [...left.events, ...right.events]) {
    const prior = events.get(event.id);
    if (!prior || compareStamps(event.stamp, prior.stamp) < 0) events.set(event.id, event);
  }
  const wallet = { base: Math.max(left.base, right.base),
    receipts: union(left.receipts, right.receipts),
    events: [...events.values()].sort((x, y) => x.id.localeCompare(y.id)) };
  return { ...newer(a, b), wallet, value: JSON.stringify(walletValue(wallet)) };
}

export function mergeRecord(key, a, b) {
  if (!a || !b) return structuredClone(a || b);
  const selected = newer(a, b);
  if (a.value === null || b.value === null) return structuredClone(selected);
  if (key === 'hint_wallet_v1') return mergeWallet(a, b);
  if (key.startsWith('puzzle_progress_')) {
    const left = list(a), right = list(b), cells = [], stamps = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const ls = a.cells?.[i] || a.stamp, rs = b.cells?.[i] || b.stamp;
      // Imported browser saves have time zero. Combine their filled cells;
      // later edits, including deliberate erasures, use individual cell clocks.
      const imported = ls.time === 0 && rs.time === 0;
      const comparison = imported && Boolean(left[i]) !== Boolean(right[i])
        ? (left[i] ? 1 : -1) : compareStamps(ls, rs) || String(left[i] || '').localeCompare(String(right[i] || ''));
      const takeLeft = right[i] === undefined || (left[i] !== undefined && comparison >= 0);
      cells.push((takeLeft ? left[i] : right[i]) || '');
      stamps.push(takeLeft ? ls : rs);
    }
    return { ...selected, value: JSON.stringify(cells), cells: stamps };
  }
  if (key.startsWith('unlocked_hints_') || key.startsWith('revealed_indices_')) {
    return { ...selected, value: JSON.stringify(union(list(a), list(b))) };
  }
  if (key.startsWith('reward_claimed_') || key.startsWith('free_hint_claimed_') || key === 'free_hint_toast_seen') {
    return { ...selected, value: String(parseValue(a) === true || parseValue(b) === true) };
  }
  if (key === 'journey_rank_high_watermark') {
    return { ...selected, value: String(Math.max(Number(a.value), Number(b.value))) };
  }
  if (key.startsWith('theme_progress_')) {
    const left = parseValue(a), right = parseValue(b);
    return { ...selected, value: JSON.stringify({ ...parseValue(selected),
      puzzlesCompleted: Math.max(left.puzzlesCompleted || 0, right.puzzlesCompleted || 0),
      completed: left.completed === true || right.completed === true }) };
  }
  return structuredClone(selected);
}

const editionOf = (records, id) => parseValue(records[`puzzle_edition_${id}`]) || 'original';
const scoreGroup = (records, id) =>
  (parseValue(records[`reward_claimed_${id}`]) === true ? 10000 : 0) +
  list(records[`puzzle_progress_${id}`]).filter(Boolean).length +
  list(records[`unlocked_hints_${id}`]).length;

export function mergeSnapshots(left = emptySnapshot(), right = emptySnapshot()) {
  const result = emptySnapshot();
  result.clock = Math.max(left.clock, right.clock);
  const groups = new Map();
  for (const snapshot of [left, right]) {
    for (const [id, choice] of Object.entries(snapshot.choices || {})) {
      result.choices[id] = newer(result.choices[id], choice);
    }
    const localGroups = {};
    for (const [key, record] of Object.entries(snapshot.records)) {
      const id = puzzleIdForKey(key);
      if (id !== null) (localGroups[id] ||= {})[key] = record;
      else result.records[key] = mergeRecord(key, result.records[key], record);
    }
    for (const [id, archived] of Object.entries(snapshot.archives || {})) {
      for (const [edition, records] of Object.entries(archived)) addGroup(id, edition, records);
    }
    for (const [id, records] of Object.entries(localGroups)) addGroup(id, editionOf(records, id), records);
  }
  function addGroup(id, edition, records) {
    if (!groups.has(id)) groups.set(id, new Map());
    const versions = groups.get(id);
    const combined = versions.get(edition) || {};
    const progressKey = `puzzle_progress_${id}`;
    const completedKey = `reward_claimed_${id}`;
    const alreadyComplete = parseValue(combined[completedKey]) === true;
    const incomingComplete = parseValue(records[completedKey]) === true;
    for (const [key, record] of Object.entries(records)) {
      if (key === progressKey && alreadyComplete !== incomingComplete) {
        const finished = alreadyComplete ? combined[key] : record;
        if (finished && list(finished).some(Boolean)) { combined[key] = structuredClone(finished); continue; }
      }
      combined[key] = mergeRecord(key, combined[key], record);
    }
    versions.set(edition, combined);
  }
  for (const [id, versions] of groups) {
    const preferred = parseValue(result.choices[id]);
    const ordered = [...versions].sort(([ea, a], [eb, b]) =>
      scoreGroup(b, id) - scoreGroup(a, id) || ea.localeCompare(eb));
    const active = versions.has(preferred) ? preferred : ordered[0][0];
    const records = structuredClone(versions.get(active));
    // Completion belongs to the puzzle ID even when devices used different grids.
    let completed;
    for (const version of versions.values()) {
      const flag = version[`reward_claimed_${id}`];
      if (flag) completed = mergeRecord(`reward_claimed_${id}`, completed, flag);
    }
    if (completed) records[`reward_claimed_${id}`] = completed;
    Object.assign(result.records, records);
    for (const [edition, version] of versions) {
      if (edition !== active) (result.archives[id] ||= {})[edition] = structuredClone(version);
    }
  }
  return result;
}

export function cloudSnapshot(snapshot) {
  return { ...snapshot,
    records: Object.fromEntries(Object.entries(snapshot.records).filter(([key]) => isSyncedKey(key))) };
}

export function serializeSnapshot(snapshot) {
  const ordered = value => Array.isArray(value) ? value.map(ordered) :
    value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, ordered(value[key])])) : value;
  return JSON.stringify(ordered(cloudSnapshot(snapshot)));
}

export function decodeSnapshot(raw) {
  const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!snapshot || snapshot.schemaVersion !== 1 || !Number.isSafeInteger(snapshot.clock) || snapshot.clock < 0 ||
    !snapshot.records || !snapshot.archives || !snapshot.choices) throw new Error('Unsupported cloud save format.');
  const stampValid = stamp => stamp && Number.isSafeInteger(stamp.time) && stamp.time >= 0 &&
    typeof stamp.device === 'string' && stamp.device.length <= 100;
  const validateRecords = records => {
    if (!records || Array.isArray(records)) throw new Error('Invalid saved progress.');
    for (const [key, record] of Object.entries(records)) {
      if (!isSyncedKey(key) || !stampValid(record?.stamp) ||
        !(record.value === null || (typeof record.value === 'string' && record.value.length <= 100000))) {
        throw new Error('Invalid saved progress.');
      }
      if (record.value === null) continue;
      const value = JSON.parse(record.value);
      if (key.startsWith('puzzle_progress_') && (!Array.isArray(value) || value.length > 100 ||
        value.some(cell => typeof cell !== 'string' || !/^[a-zA-Z.]?$/.test(cell)))) throw new Error('Invalid saved grid.');
      if (key.startsWith('puzzle_edition_') && (typeof value !== 'string' ||
        !/^(original|editions\/[a-z0-9-]+\.json)$/.test(value))) throw new Error('Invalid saved edition.');
      if (record.cells && (!Array.isArray(record.cells) || record.cells.length > 100 ||
        !record.cells.every(stampValid))) throw new Error('Invalid saved cell dates.');
      if ((key.startsWith('reward_claimed_') || key.startsWith('free_hint_claimed_')) &&
        typeof value !== 'boolean') throw new Error('Invalid saved completion.');
      if ((key.startsWith('unlocked_hints_') || key.startsWith('revealed_indices_')) &&
        (!Array.isArray(value) || value.length > 200)) throw new Error('Invalid saved hints.');
      if (key.startsWith('unlocked_hints_') && value.some(item =>
        typeof item !== 'string' || !/^(across|down)-\d{1,3}$/.test(item))) throw new Error('Invalid saved hints.');
      if (key.startsWith('revealed_indices_') && value.some(item =>
        !Number.isInteger(item) || item < 0 || item >= 100)) throw new Error('Invalid revealed cells.');
      if (key.startsWith('theme_progress_') && (!value || typeof value !== 'object' ||
        !Number.isSafeInteger(value.puzzlesCompleted) || value.puzzlesCompleted < 0 ||
        typeof value.completed !== 'boolean')) throw new Error('Invalid saved theme progress.');
      if (['journey_rank_high_watermark', 'hints_empty_timestamp', 'bonus_hints_awarded_since_empty', 'global_hints_remaining'].includes(key) &&
        (!Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid saved game counter.');
      if (key === 'hint_wallet_v1') {
        if (!value || !Number.isSafeInteger(value.balance) || value.balance < 0 || value.balance > 20 ||
          !Array.isArray(value.receipts) || !value.receipts.every(r => typeof r === 'string')) throw new Error('Invalid saved hint balance.');
        if (record.wallet && (!Number.isSafeInteger(record.wallet.base) || record.wallet.base < 0 ||
          record.wallet.base > 20 || !Array.isArray(record.wallet.receipts) || !Array.isArray(record.wallet.events) ||
          record.wallet.events.some(event => typeof event.id !== 'string' || !stampValid(event.stamp) ||
            !Number.isSafeInteger(event.delta) || Math.abs(event.delta) > 20 ||
            (event.receipt != null && typeof event.receipt !== 'string')))) throw new Error('Invalid saved hint history.');
      }
    }
  };
  validateRecords(snapshot.records);
  for (const [id, versions] of Object.entries(snapshot.archives)) {
    if (!/^[a-z0-9-]{1,150}$/.test(id)) throw new Error('Invalid archived puzzle.');
    for (const [edition, records] of Object.entries(versions)) {
      if (!/^(original|editions\/[a-z0-9-]+\.json)$/.test(edition)) throw new Error('Invalid archived edition.');
      validateRecords(records);
      if (Object.keys(records).some(key => puzzleIdForKey(key) !== id)) throw new Error('Invalid archived progress.');
    }
  }
  for (const [id, choice] of Object.entries(snapshot.choices)) {
    if (!/^[a-z0-9-]{1,150}$/.test(id) || !stampValid(choice.stamp) ||
      typeof parseValue(choice) !== 'string') throw new Error('Invalid saved edition choice.');
  }
  const result = structuredClone(snapshot);
  const collectClock = value => {
    if (!value || typeof value !== 'object') return;
    if (Number.isSafeInteger(value.time) && typeof value.device === 'string') result.clock = Math.max(result.clock, value.time);
    for (const child of Object.values(value)) collectClock(child);
  };
  collectClock(result.records);
  collectClock(result.archives);
  collectClock(result.choices);
  return result;
}
