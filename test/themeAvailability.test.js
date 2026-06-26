import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  classifyThemeEntries,
  formatNextReleaseDate,
  getNextMonthlyReleaseAt
} from '../src/utils/themeAvailability.js';

const require = createRequire(import.meta.url);
const { buildThemeAvailability } = require('../scripts/themeRotation.cjs');

function themeState(completed) {
  return { hasCompletedAllThemePuzzles: completed };
}

test('keeps a caught-up scheduled theme active without unrelated backfill', () => {
  const scheduled = themeState(true);
  const locked = themeState(false);
  const result = classifyThemeEntries({
    sortedThemeEntries: [['Scheduled', []], ['Locked', []]],
    themeStatesByName: { Scheduled: scheduled, Locked: locked, Parent: themeState(false) },
    themeVisibility: { Locked: { lockedUntilThemeCompleted: 'Parent' } },
    themeAvailability: { Scheduled: { receivesNextBatch: true } }
  });

  assert.deepEqual(result.activeThemeEntries, [['Scheduled', scheduled]]);
  assert.deepEqual(result.completedThemeEntries, []);
});

test('archives an exhausted theme and unlocks only its configured successor', () => {
  const exhausted = themeState(true);
  const successor = themeState(false);
  const unrelated = themeState(false);
  const result = classifyThemeEntries({
    sortedThemeEntries: [
      ['Exhausted', []],
      ['Successor', []],
      ['Unrelated', []]
    ],
    themeStatesByName: {
      Exhausted: exhausted,
      Successor: successor,
      Unrelated: unrelated,
      OtherParent: themeState(false)
    },
    themeVisibility: {
      Successor: { lockedUntilThemeCompleted: 'Exhausted' },
      Unrelated: { lockedUntilThemeCompleted: 'OtherParent' }
    },
    themeAvailability: {
      Exhausted: { receivesNextBatch: false },
      Successor: { receivesNextBatch: true }
    }
  });

  assert.deepEqual(result.activeThemeEntries, [['Successor', successor]]);
  assert.deepEqual(result.completedThemeEntries, [['Exhausted', exhausted]]);
});

test('treats missing availability metadata conservatively', () => {
  const caughtUp = themeState(true);
  const result = classifyThemeEntries({
    sortedThemeEntries: [['Caught Up', []]],
    themeStatesByName: { 'Caught Up': caughtUp }
  });

  assert.deepEqual(result.activeThemeEntries, [['Caught Up', caughtUp]]);
  assert.deepEqual(result.completedThemeEntries, []);
});

test('a newly added puzzle returns a waiting theme to normal active status', () => {
  const replenished = themeState(false);
  const result = classifyThemeEntries({
    sortedThemeEntries: [['Replenished', []]],
    themeStatesByName: { Replenished: replenished },
    themeAvailability: { Replenished: { receivesNextBatch: true } }
  });

  assert.deepEqual(result.activeThemeEntries, [['Replenished', replenished]]);
});

test('calculates and formats monthly release dates across a year boundary', () => {
  const now = new Date('2026-12-31T23:59:59-07:00');
  assert.equal(getNextMonthlyReleaseAt(now), '2027-02-01T00:00:00.000Z');
  assert.equal(
    formatNextReleaseDate('2027-01-01T00:00:00.000Z', { locale: 'en-US' }),
    'January 1'
  );
});

test('falls back to the next monthly release when the timestamp is missing', () => {
  assert.equal(
    formatNextReleaseDate('', {
      now: new Date('2026-12-15T12:00:00.000Z'),
      locale: 'en-US'
    }),
    'January 1'
  );
});

test('derives scheduled and exhausted availability from the rotation manifest', () => {
  assert.deepEqual(buildThemeAvailability({
    slots: [
      {
        currentTheme: 'Current',
        status: 'active',
        nextTheme: 'Successor'
      },
      {
        currentTheme: 'Done',
        status: 'exhausted',
        nextTheme: 'Replacement'
      }
    ],
    retired: [{ theme: 'Retired' }]
  }), {
    Current: { status: 'scheduled', receivesNextBatch: true },
    Successor: { status: 'scheduled', receivesNextBatch: true },
    Done: { status: 'exhausted', receivesNextBatch: false },
    Replacement: { status: 'scheduled', receivesNextBatch: true },
    Retired: { status: 'exhausted', receivesNextBatch: false }
  });
});
