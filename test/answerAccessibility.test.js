import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccessibleAnswer, passesAnswerAccessibility } from '../scripts/answerAccessibility.js';

test('rejects the obscure scientific answers missed by the old signal regex', () => {
  for (const zipfFrequency of [-8.9, -6.1, -4.9, 0.5, 1.5]) {
    assert.equal(isAccessibleAnswer({ zipfFrequency }), false);
  }
  assert.equal(isAccessibleAnswer({}), false);
});

test('requires a familiar majority when unreviewed words are used', () => {
  const familiar = { zipfFrequency: 4 };
  const rare = { zipfFrequency: 2.7 };
  assert.equal(passesAnswerAccessibility([familiar, familiar, rare]), true);
  assert.equal(passesAnswerAccessibility([familiar, rare, rare]), false);
});

test('allows explicitly reviewed compounds absent from the corpus', () => {
  assert.equal(isAccessibleAnswer({ zipfFrequency: -1, editorialReviewed: true }), true);
});
