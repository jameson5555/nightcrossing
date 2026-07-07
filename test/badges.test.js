import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const BADGES_SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/utils/badges.js'), 'utf8');

function parseRankDefinitions() {
  const ranks = [];
  const pattern = /\{\s*level:\s*(\d+),\s*name:\s*'([^']+)',\s*required:\s*(\d+),\s*asset:\s*([a-zA-Z0-9_]+)\s*\}/g;
  let match;

  while ((match = pattern.exec(BADGES_SOURCE)) !== null) {
    ranks.push({
      level: Number(match[1]),
      name: match[2],
      required: Number(match[3]),
      assetIdentifier: match[4]
    });
  }

  return ranks;
}

const RANKS = parseRankDefinitions();

function getJourneyRankLevel(puzzlesCompleted, minimumLevel = 1) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  const maxLevel = RANKS[RANKS.length - 1].level;
  const safeMinimum = Math.min(Math.max(1, Number(minimumLevel) || 1), maxLevel);
  let level = 1;

  for (const rank of RANKS) {
    if (completed >= rank.required) level = rank.level;
  }

  return Math.max(level, safeMinimum);
}

function getJourneyProgress(puzzlesCompleted, minimumLevel = 1) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  const currentLevel = getJourneyRankLevel(completed, minimumLevel);
  const current = RANKS.find(rank => rank.level === currentLevel);
  const next = RANKS.find(rank => rank.level > currentLevel) || null;
  const progress = next ? Math.min(1, Math.max(0, completed / next.required)) : 1;

  return { current, next, progress };
}

test('journey rank ladder has the planned 17 thresholds', () => {
  assert.deepEqual(
    RANKS.map(({ level, name, required }) => ({ level, name, required })),
    [
      { level: 1, name: 'Dark Horizon', required: 1 },
      { level: 2, name: 'Dusk', required: 3 },
      { level: 3, name: 'Twilight', required: 6 },
      { level: 4, name: 'Starlight', required: 10 },
      { level: 5, name: 'Midnight', required: 15 },
      { level: 6, name: 'Deep Night', required: 21 },
      { level: 7, name: 'Dreamer', required: 28 },
      { level: 8, name: 'Moonwalker', required: 36 },
      { level: 9, name: 'Night Sage', required: 45 },
      { level: 10, name: 'Star Guide', required: 60 },
      { level: 11, name: 'Eclipse Walker', required: 78 },
      { level: 12, name: 'Comet Keeper', required: 99 },
      { level: 13, name: 'Aurora Seer', required: 123 },
      { level: 14, name: 'Constellation Weaver', required: 150 },
      { level: 15, name: 'Void Cartographer', required: 180 },
      { level: 16, name: 'Dawnbringer', required: 215 },
      { level: 17, name: 'Nightcrossing', required: 250 }
    ]
  );
});

test('journey rank boundaries match the evergreen threshold model', () => {
  assert.equal(getJourneyRankLevel(0), 1);
  assert.equal(getJourneyRankLevel(1), 1);
  assert.equal(getJourneyRankLevel(3), 2);
  assert.equal(getJourneyRankLevel(45), 9);
  assert.equal(getJourneyRankLevel(60), 10);
  assert.equal(getJourneyRankLevel(99), 12);
  assert.equal(getJourneyRankLevel(123), 13);
  assert.equal(getJourneyRankLevel(180), 15);
  assert.equal(getJourneyRankLevel(215), 16);
  assert.equal(getJourneyRankLevel(250), 17);
  assert.equal(getJourneyRankLevel(300), 17);
});

test('journey progress is independent of current catalog size', () => {
  const progressBeforeRelease = getJourneyProgress(101);
  const progressAfterRelease = getJourneyProgress(101);

  assert.deepEqual(progressAfterRelease, progressBeforeRelease);
  assert.equal(progressBeforeRelease.current.name, 'Comet Keeper');
  assert.equal(progressBeforeRelease.next.name, 'Aurora Seer');
  assert.equal(progressBeforeRelease.progress, 101 / 123);
});

test('journey meter shows cumulative progress toward the next rank', () => {
  const earlyProgress = getJourneyProgress(4);
  const thresholdProgress = getJourneyProgress(78);

  assert.equal(earlyProgress.current.name, 'Dusk');
  assert.equal(earlyProgress.next.name, 'Twilight');
  assert.equal(earlyProgress.progress, 4 / 6);
  assert.equal(thresholdProgress.current.name, 'Eclipse Walker');
  assert.equal(thresholdProgress.next.name, 'Comet Keeper');
  assert.equal(thresholdProgress.progress, 78 / 99);
});

test('journey rank high-water mark prevents downgrade', () => {
  const progress = getJourneyProgress(45, 12);

  assert.equal(progress.current.name, 'Comet Keeper');
  assert.equal(progress.next.name, 'Aurora Seer');
  assert.equal(progress.progress, 45 / 123);
});

test('all planned badge assets exist and are imported', () => {
  for (const rank of RANKS) {
    const importPattern = new RegExp(`import\\s+${rank.assetIdentifier}\\s+from\\s+'([^']+)'`);
    const match = BADGES_SOURCE.match(importPattern);
    assert.ok(match, `missing import for ${rank.name}`);

    const assetPath = path.join(process.cwd(), 'src/utils', match[1]);
    assert.ok(fs.existsSync(assetPath), `missing SVG for ${rank.name}`);
    assert.match(fs.readFileSync(assetPath, 'utf8'), /<svg\b/);
  }
});
