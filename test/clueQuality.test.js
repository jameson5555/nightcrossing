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

test('rejects dictionary clues with dangling context references', () => {
  const BAD_CONTEXT_CLUES = [
    ['HANDBALL', 'Medium-sized inflated ball used in this sport'],
    ['ROBATA', 'Restaurant featuring such a grill.'],
    ['KICKBALL', 'Ball used in the above sport'],
    ['THISTLE', 'This plant seen as the national emblem of Scotland']
  ];

  for (const [answer, clue] of BAD_CONTEXT_CLUES) {
    assert.equal(isWordEntryAcceptable({ answer, clue, hint: '' }).reason, 'low-quality');
  }
});

test('rejects inappropriate alternate-sense hints', () => {
  const result = isWordEntryAcceptable({
    answer: 'NOSH',
    clue: 'Light meal or snack',
    hint: 'Fellatio'
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'profanity');
});

test('keeps standalone examples that use such as', () => {
  assert.equal(
    isWordEntryAcceptable({
      answer: 'RINKS',
      clue: 'Sheet of ice prepared for playing certain sports, such as hockey or curling.',
      hint: ''
    }).ok,
    true
  );
});

test('rejects clues with glued source attribution tails', () => {
  assert.equal(
    isWordEntryAcceptable({
      answer: 'NERVI',
      clue: 'Former fishing villageLonely Planet.',
      hint: ''
    }).reason,
    'low-quality'
  );
});
