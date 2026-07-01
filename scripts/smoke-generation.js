import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

process.env.NC_LAYOUT_ATTEMPT_SCALE ||= '0.2';
process.env.NC_PRIMARY_CORE_POOL_LIMIT ||= '120';

const [{ generateThemedPuzzle, THEMES }, { computePuzzleMetrics }] = await Promise.all([
  import('./proceduralEngine.js'),
  import('./puzzleMetrics.js')
]);

const HARD_THEMES = [
  'Food & Cooking',
  'Music & Sound',
  'Ocean & Marine Life'
];

function collectConsumedAnswers(themeName) {
  const consumed = new Set();
  for (const file of fs.readdirSync('public/data/puzzles').filter(name => name.endsWith('.json'))) {
    const puzzle = JSON.parse(fs.readFileSync(`public/data/puzzles/${file}`, 'utf8'));
    if (puzzle.theme !== themeName) continue;
    for (const answer of [...puzzle.answers.across, ...puzzle.answers.down]) {
      consumed.add(answer.toUpperCase());
    }
  }
  return consumed;
}

for (const themeName of HARD_THEMES) {
  const theme = THEMES.find(candidate => candidate.name === themeName);
  assert.ok(theme, `Missing smoke-test theme: ${themeName}`);

  const consumed = collectConsumedAnswers(themeName);
  const runs = themeName === 'Food & Cooking' ? 3 : 1;

  for (let run = 1; run <= runs; run++) {
    const availableWords = theme.words.filter(word => !consumed.has(word.answer.toUpperCase()));
    const startedAt = performance.now();
    const { puzzle, usedWords } = generateThemedPuzzle(
      `smoke-${themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${run}`,
      theme.name,
      availableWords
    );
    const metrics = computePuzzleMetrics(puzzle);
    const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);

    usedWords.forEach(answer => consumed.add(answer));
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
      `${themeName} run ${run}: ${metrics.cols}x${metrics.rows}, ${metrics.placedWords} words, ` +
      `${metrics.totalIntersections} intersections, ${elapsedSeconds}s`
    );
  }
}
