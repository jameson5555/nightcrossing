const hasLetters = value => Array.isArray(value) && value.some(cell =>
  typeof cell === 'string' && cell.trim() !== '');
const parse = value => value ? JSON.parse(value) : null;

// Edition files are immutable. A player with saved state keeps the exact grid
// that state belongs to, even across several later editorial updates.
export function createPuzzleLoader({ store, fetchData }) {
  return async function loadPuzzle(id, { pin = false, ...options } = {}) {
    const original = await fetchData(`puzzles/${encodeURIComponent(id)}.json`, options);
    const keys = ['puzzle_progress_', 'reward_claimed_', 'free_hint_claimed_',
      'unlocked_hints_', 'revealed_indices_', 'puzzle_edition_'];
    const saved = await Promise.all(keys.map(prefix => store.get({ key: `${prefix}${id}` })));
    const [cells, completed, freeHint, hints, revealed, edition] = saved.map(({ value }) => parse(value));
    const started = hasLetters(cells) || completed === true || freeHint === true ||
      (Array.isArray(hints) && hints.length > 0) || (Array.isArray(revealed) && revealed.length > 0);
    const selected = started ? (edition || 'original') : (original.currentEdition || 'original');
    if (selected !== 'original' && !/^editions\/[a-z0-9-]+\.json$/.test(selected)) {
      throw new Error(`Invalid saved edition for ${id}`);
    }
    const puzzle = selected === 'original' ? original :
      await fetchData(`puzzles/${selected}`, options);
    if (puzzle.id !== id || puzzle.theme !== original.theme) {
      throw new Error(`Edition identity mismatch for ${id}`);
    }
    // Persist before play can save cells or spend hints. Menu scans never pin
    // untouched puzzles. A failed load never silently swaps to another grid.
    if (pin) await store.set({ key: `puzzle_edition_${id}`, value: JSON.stringify(selected) });
    return puzzle;
  };
}
