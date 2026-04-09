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
