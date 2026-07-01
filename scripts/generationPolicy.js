export function decideThemeBatchOutcome({
  generatedCount,
  targetCount,
  readiness
}) {
  if (generatedCount >= targetCount) {
    return {
      action: 'complete',
      remainingCount: 0
    };
  }

  const remainingCount = Math.max(0, targetCount - generatedCount);
  if (readiness && readiness.isReady === false) {
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
