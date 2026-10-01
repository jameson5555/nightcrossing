const REVISION_KEY = 'puzzle_layout_revisions';
const PUZZLE_KEYS = [
  'puzzle_progress_', 'unlocked_hints_', 'revealed_indices_',
  'reward_claimed_', 'free_hint_claimed_'
];

// Replacing a grid invalidates its cell positions and clue numbers. Keep the
// wallet, journey rank, and all progress for other puzzles intact.
export async function reconcilePuzzleRevisions(store, revisions = {}) {
  const { value } = await store.get({ key: REVISION_KEY });
  const previous = value ? JSON.parse(value) : {};
  const changed = [];
  const next = { ...previous };
  for (const [id, entry] of Object.entries(revisions)) {
    if (!entry?.revision) continue;
    if (previous[id] !== entry.revision) {
      await Promise.all(PUZZLE_KEYS.map(prefix => store.remove({ key: `${prefix}${id}` })));
      if (entry.theme) await store.remove({ key: `theme_progress_${entry.theme}` });
      changed.push(id);
      next[id] = entry.revision;
    }
  }
  if (changed.length) await store.set({ key: REVISION_KEY, value: JSON.stringify(next) });
  return changed;
}
