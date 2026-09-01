export function decideThemeBatchOutcome({
  generatedCount,
  targetCount,
  readiness,
  generationFailureCount = 0,
  generationFailureThreshold = Infinity
}) {
  if (generatedCount >= targetCount) {
    return {
      action: 'complete',
      remainingCount: 0
    };
  }

  const remainingCount = Math.max(0, targetCount - generatedCount);
  const hasCapacity = readiness &&
    readiness.projectedPuzzles >= remainingCount &&
    readiness.usableCoreWords >= remainingCount * 6;
  const hasRepeatedGenerationFailures =
    Number.isFinite(generationFailureThreshold) &&
    generationFailureCount >= generationFailureThreshold;

  if ((readiness && !hasCapacity) || hasRepeatedGenerationFailures) {
    return {
      action: 'exhaust',
      remainingCount
    };
  }

  return {
    action: 'fail',
    remainingCount
  };
}

export function isExhaustibleGenerationFailure(error) {
  const message = String(error?.message || error || '');
  return /^Could not generate a constrained puzzle for /.test(message) ||
    /^Only \d+ clue-safe words remain for /.test(message);
}

export function dedupeWordsByClue(words) {
  const seenClues = new Set();
  return words.filter(word => {
    const clueKey = String(word?.clue || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.?!]+$/g, '')
      .trim();
    if (!clueKey || seenClues.has(clueKey)) return false;
    seenClues.add(clueKey);
    return true;
  });
}

export function assertSuccessfulThemeBatch({
  themeName,
  generatedCount,
  targetCount,
  exhausted = false
}) {
  if (generatedCount >= targetCount || exhausted) return;

  throw new Error(
    `Incomplete generation batch for ${themeName}: generated ${generatedCount}/${targetCount} puzzle(s).`
  );
}
