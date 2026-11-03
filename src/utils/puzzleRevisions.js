const REVISION_KEY = 'puzzle_layout_revisions';

export async function recordDatasetVersion(store, version) {
  const next = String(version || '').trim();
  if (!next) return false;
  const { value } = await store.get({ key: 'puzzle_dataset_version' });
  if (value === next) return false;
  await store.set({ key: 'puzzle_dataset_version', value: next });
  return true;
}
// Track catalog revisions without deleting player data. The edition-aware
// loader keeps saved cells, hint state and completion attached to their grid.
export async function reconcilePuzzleRevisions(store, revisions = {}) {
  const { value } = await store.get({ key: REVISION_KEY });
  const previous = value ? JSON.parse(value) : {};
  const changed = [];
  const next = { ...previous };
  for (const [id, entry] of Object.entries(revisions)) {
    if (!entry?.revision) continue;
    if (previous[id] !== entry.revision) {
      changed.push(id);
      next[id] = entry.revision;
    }
  }
  if (changed.length) await store.set({ key: REVISION_KEY, value: JSON.stringify(next) });
  return changed;
}
