export function getPuzzleStatus(answers, expectedGrid, completionClaimed = false) {
  // Completion survives clue edits and stale saved cells. Explicit layout
  // revisions clear this record along with the incompatible cell positions.
  if (completionClaimed) return 'Completed';
  if (!Array.isArray(answers) || !Array.isArray(expectedGrid)) return 'New';

  const playableIndices = expectedGrid
    .map((cell, idx) => (cell !== '.' ? idx : -1))
    .filter(idx => idx !== -1);
  if (!playableIndices.length) return 'New';

  const hasProgress = playableIndices.some(idx =>
    typeof answers[idx] === 'string' && answers[idx].trim() !== '');
  if (!hasProgress) return 'New';

  const completed = playableIndices.every(idx => {
    const expected = String(expectedGrid[idx] || '').toUpperCase();
    const actual = String(answers[idx] || '').toUpperCase();
    return expected !== '' && actual === expected;
  });
  return completed ? 'Completed' : 'In Progress';
}
