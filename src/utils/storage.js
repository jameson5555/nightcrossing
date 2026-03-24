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

// Helpful for checking list status
export const checkPuzzleStatus = async (puzzleId, totalCells) => {
  const progress = await loadPuzzleProgress(puzzleId);
  if (!progress) return 'New';
  
  const filledCount = progress.filter(c => c && c !== '').length;
  if (filledCount === 0) return 'New';
  if (filledCount === totalCells) return 'Completed'; // Note: In reality we should check correctness, but simpler to check filled.
  return 'In Progress';
};
