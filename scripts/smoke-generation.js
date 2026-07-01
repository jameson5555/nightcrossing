import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

process.env.NC_LAYOUT_ATTEMPT_SCALE ||= '0.2';

const [{ generateThemedPuzzle, THEMES }, { computePuzzleMetrics }] = await Promise.all([
  import('./proceduralEngine.js'),
  import('./puzzleMetrics.js')
]);

const HARD_THEMES = [
  'Food & Cooking',
  'Music & Sound',
  'Ocean & Marine Life'
];

for (const themeName of HARD_THEMES) {
  const theme = THEMES.find(candidate => candidate.name === themeName);
  assert.ok(theme, `Missing smoke-test theme: ${themeName}`);

  const startedAt = performance.now();
  const { puzzle } = generateThemedPuzzle(
    `smoke-${themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    theme.name,
    theme.words
  );
  const metrics = computePuzzleMetrics(puzzle);
  const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);

  assert.ok(metrics.rows <= 10, `${themeName} exceeded the 10-row limit`);
  assert.ok(metrics.cols <= 10, `${themeName} exceeded the 10-column limit`);
  assert.ok(metrics.placedWords >= 6, `${themeName} placed fewer than six words`);
  assert.equal(metrics.connected, true, `${themeName} produced a disconnected layout`);
  assert.ok(
    metrics.longWordCount === 0 || metrics.longWordTwoPlusRate >= 0.82,
    `${themeName} failed the long-word intersection gate`
  );
  assert.ok(
    metrics.veryLongWordCount === 0 || metrics.veryLongWordThreePlusRate >= 0.62,
    `${themeName} failed the very-long-word intersection gate`
  );

  console.log(
    `${themeName}: ${metrics.cols}x${metrics.rows}, ${metrics.placedWords} words, ` +
    `${metrics.totalIntersections} intersections, ${elapsedSeconds}s`
  );
}
