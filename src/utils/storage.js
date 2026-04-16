import { Preferences } from '@capacitor/preferences';

export const savePuzzleProgress = async (puzzleId, answers) => {
  await Preferences.set({
    key: `puzzle_progress_${puzzleId}`,
    value: JSON.stringify(answers)
  });
};

export const loadPuzzleProgress = async (puzzleId) => {
  const { value } = await Preferences.get({ key: `puzzle_progress_${puzzleId}` });
  return value ? JSON.parse(value) : null;
};

// Helpful for checking list status using the puzzle's expected grid.
export const checkPuzzleStatus = async (puzzleId, expectedGrid) => {
  const progress = await loadPuzzleProgress(puzzleId);
  if (!progress) return 'New';
  if (!Array.isArray(expectedGrid)) return 'New';

  const answers = Array.isArray(progress) ? progress : [];

  const playableIndices = expectedGrid
    .map((cell, idx) => (cell !== '.' ? idx : -1))
    .filter(idx => idx !== -1);

  if (playableIndices.length === 0) return 'New';

  const filledPlayableCount = playableIndices.filter(idx => {
    const val = answers[idx];
    return typeof val === 'string' && val.trim() !== '';
  }).length;

  if (filledPlayableCount === 0) return 'New';

  const isCompleted = playableIndices.every(idx => {
    const expected = String(expectedGrid[idx] || '').toUpperCase();
    const actual = String(answers[idx] || '').toUpperCase();
    return expected !== '' && expected !== '.' && actual === expected;
  });

  return isCompleted ? 'Completed' : 'In Progress';
};

// --- HINT SYSTEM ---

export const saveHintsRemaining = async (count) => {
  await Preferences.set({
    key: 'global_hints_remaining',
    value: String(count)
  });
};

export const loadHintsRemaining = async () => {
  const { value } = await Preferences.get({ key: 'global_hints_remaining' });
  // Default to 3 hints if never set
  return value !== null ? parseInt(value, 10) : 3;
};

export const saveUnlockedHints = async (puzzleId, hintIdsSet) => {
  await Preferences.set({
    key: `unlocked_hints_${puzzleId}`,
    value: JSON.stringify(Array.from(hintIdsSet))
  });
};

export const loadUnlockedHints = async (puzzleId) => {
  const { value } = await Preferences.get({ key: `unlocked_hints_${puzzleId}` });
  return value ? new Set(JSON.parse(value)) : new Set();
};

export const saveRewardClaimed = async (puzzleId) => {
  await Preferences.set({
    key: `reward_claimed_${puzzleId}`,
    value: 'true'
  });
};

export const loadRewardClaimed = async (puzzleId) => {
  const { value } = await Preferences.get({ key: `reward_claimed_${puzzleId}` });
  return value === 'true';
};

export const saveRevealedIndices = async (puzzleId, indicesSet) => {
  await Preferences.set({
    key: `revealed_indices_${puzzleId}`,
    value: JSON.stringify(Array.from(indicesSet))
  });
};

export const loadRevealedIndices = async (puzzleId) => {
  const { value } = await Preferences.get({ key: `revealed_indices_${puzzleId}` });
  return value ? new Set(JSON.parse(value)) : new Set();
};

export const saveHintsEmptyTimestamp = async (timestamp) => {
  await Preferences.set({
    key: 'hints_empty_timestamp',
    value: timestamp.toString()
  });
};

export const loadHintsEmptyTimestamp = async () => {
  const { value } = await Preferences.get({ key: 'hints_empty_timestamp' });
  return value ? parseInt(value, 10) : null;
};

export const clearHintsEmptyTimestamp = async () => {
  await Preferences.remove({ key: 'hints_empty_timestamp' });
};

// --- THEME BADGE PROGRESS HELPERS ---
export const saveThemeProgress = async (themeId, progress) => {
  if (!themeId) return;
  await Preferences.set({
    key: `theme_progress_${themeId}`,
    value: JSON.stringify(progress)
  });
};

export const loadThemeProgress = async (themeId) => {
  if (!themeId) return { themeId: String(themeId), puzzlesCompleted: 0, badgeLevel: 1 };
  const { value } = await Preferences.get({ key: `theme_progress_${themeId}` });
  return value ? JSON.parse(value) : { themeId: String(themeId), puzzlesCompleted: 0, badgeLevel: 1 };
};


