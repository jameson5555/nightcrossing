// Opening the menu creates wallet and catalog records. Only actual puzzle
// activity or earned achievements should promote the guest sign-in link.
export async function hasSavedProgress(store) {
  const { keys } = await store.keys();
  for (const key of keys) {
    if (!/^(puzzle_progress_|reward_claimed_|free_hint_claimed_|unlocked_hints_|revealed_indices_|theme_progress_)/.test(key) &&
        key !== 'journey_rank_high_watermark') continue;
    const { value } = await store.get({ key });
    let saved;
    try { saved = JSON.parse(value); } catch { continue; }
    if (key.startsWith('puzzle_progress_')) {
      if (Array.isArray(saved) && saved.some(cell => typeof cell === 'string' && cell.trim())) return true;
    } else if (key.startsWith('unlocked_hints_') || key.startsWith('revealed_indices_')) {
      if (Array.isArray(saved) && saved.length > 0) return true;
    } else if (key.startsWith('theme_progress_')) {
      if (saved?.completed === true || saved?.puzzlesCompleted > 0) return true;
    } else if (key === 'journey_rank_high_watermark') {
      if (typeof saved === 'number' && saved > 1) return true;
    } else if (saved === true) return true;
  }
  return false;
}
