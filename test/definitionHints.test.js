import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDefinitionEntryFromTexts } from '../scripts/fetch-theme-words.js';

test('does not use a different dictionary sense as a hint', () => {
  const entry = buildDefinitionEntryFromTexts([
    'Activity of getting dressed',
    'Sauce, especially a cold one for salads'
  ], 'DRESSING');
  assert.ok(entry);
  assert.equal(entry.clueText, 'Activity of getting dressed');
  assert.equal(entry.hint, 'Starts with D and ends with G.');
  assert.doesNotMatch(entry.hint, /sauce|salad/i);
});

test('skips a truncated definition and selects a standalone definition', () => {
  const entry = buildDefinitionEntryFromTexts([
    'Certain fish, such as',
    'Red sea fish often cooked whole'
  ], 'SNAPPER');
  assert.ok(entry);
  assert.equal(entry.clueText, 'Red sea fish often cooked whole');
});
