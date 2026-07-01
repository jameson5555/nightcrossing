import test from 'node:test';
import assert from 'node:assert/strict';
import { hasClueNumberMismatch, isWordEntryAcceptable } from '../scripts/clueQuality.js';

const NUMBER_MISMATCHES = [
  ['PLIERS', 'Gripping hand tool'],
  ['PLANKTON', 'Tiny drifting marine organisms'],
  ['HARVEST', 'Gather garden crops'],
  ['DERBY', 'Several annual horse races.'],
  ['NIMBUS', 'Gray rain cloud'],
  ['DELUGES', 'Great flood or rain']
];

test('rejects the singular/plural mismatches caught by the dataset audit', () => {
  for (const [answer, clue] of NUMBER_MISMATCHES) {
    assert.equal(hasClueNumberMismatch(answer, clue), true, `${answer}: ${clue}`);
    assert.equal(isWordEntryAcceptable({ answer, clue, hint: '' }).reason, 'clue-number-mismatch');
  }
});

test('keeps matching simple noun clues', () => {
  assert.equal(hasClueNumberMismatch('CLOUD', 'Gray rain cloud'), false);
  assert.equal(hasClueNumberMismatch('TOOLS', 'Useful hand tools'), false);
});
