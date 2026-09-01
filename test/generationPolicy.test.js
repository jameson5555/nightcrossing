import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSuccessfulThemeBatch,
  decideThemeBatchOutcome,
  dedupeWordsByClue,
  isExhaustibleGenerationFailure
} from '../scripts/generationPolicy.js';

test('keeps a complete generation batch unchanged', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 3,
    targetCount: 3,
    readiness: { isReady: true, projectedPuzzles: 3, usableCoreWords: 18 }
  }), {
    action: 'complete',
    remainingCount: 0
  });
});

test('does not exhaust a ready theme after a transient generation failure', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 1,
    targetCount: 3,
    readiness: { isReady: true, projectedPuzzles: 20, usableCoreWords: 100 },
    generationFailureCount: 1,
    generationFailureThreshold: 3
  }), {
    action: 'fail',
    remainingCount: 2
  });
});

test('exhausts a ready theme after repeated generation failures', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 1,
    targetCount: 3,
    readiness: { isReady: true, projectedPuzzles: 20, usableCoreWords: 100 },
    generationFailureCount: 3,
    generationFailureThreshold: 3
  }), {
    action: 'exhaust',
    remainingCount: 2
  });
});

test('counts constrained-layout and clue-safe depletion errors toward exhaustion', () => {
  assert.equal(
    isExhaustibleGenerationFailure(new Error('Could not generate a constrained puzzle for Internet & Software.')),
    true
  );
  assert.equal(
    isExhaustibleGenerationFailure(new Error('Only 4 clue-safe words remain for Internet & Software.')),
    true
  );
  assert.equal(
    isExhaustibleGenerationFailure(new TypeError('Cannot read properties of undefined')),
    false
  );
});

test('allows a genuinely weak theme to transition to its successor', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 1,
    targetCount: 3,
    readiness: {
      isReady: false,
      projectedPuzzles: 0,
      usableCoreWords: 4,
      readinessFailures: ['projected 0/2 puzzle(s)']
    }
  }), {
    action: 'exhaust',
    remainingCount: 2
  });
});

test('does not treat a quality advisory as exhaustion when batch capacity remains', () => {
  assert.deepEqual(decideThemeBatchOutcome({
    generatedCount: 1,
    targetCount: 3,
    readiness: {
      isReady: false,
      projectedPuzzles: 12,
      usableCoreWords: 80,
      readinessFailures: ['hint coverage 0.49 < 0.5']
    }
  }), {
    action: 'fail',
    remainingCount: 2
  });
});

test('removes duplicate normalized clues before layout search', () => {
  assert.deepEqual(dedupeWordsByClue([
    { answer: 'ONE', clue: 'Shared clue.' },
    { answer: 'TWO', clue: 'shared   clue' },
    { answer: 'THREE', clue: 'Unique clue' }
  ]).map(word => word.answer), ['ONE', 'THREE']);
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
