import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSuccessfulThemeBatch,
  decideThemeBatchOutcome
} from '../scripts/generationPolicy.js';

test('keeps a complete generation batch unchanged', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 3,
    targetCount: 3,
    readiness: { isReady: true }
  }), {
    action: 'complete',
    remainingCount: 0
  });
});

test('does not exhaust a ready theme after a transient generation failure', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 1,
    targetCount: 3,
    readiness: { isReady: true }
  }), {
    action: 'fail',
    remainingCount: 2
  });
});

test('allows a genuinely weak theme to transition to its successor', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 1,
    targetCount: 3,
    readiness: {
      isReady: false,
      readinessFailures: ['projected 0/2 puzzle(s)']
    }
  }), {
    action: 'exhaust',
    remainingCount: 2
  });
});

test('rejects an incomplete batch without a handled exhaustion transition', () => {
  assert.throws(
    () => assertSuccessfulThemeBatch({
      themeName: 'Food & Cooking',
      generatedCount: 1,
      targetCount: 3
    }),
    /generated 1\/3/
  );
});

test('accepts an incomplete final wave only after an exhaustion transition', () => {
  assert.doesNotThrow(() => assertSuccessfulThemeBatch({
    themeName: 'Retiring Theme',
    generatedCount: 1,
    targetCount: 3,
    exhausted: true
  }));
});
