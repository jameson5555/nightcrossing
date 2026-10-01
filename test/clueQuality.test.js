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

test('rejects the dangling and taxonomic definitions found in the October batch', () => {
  for (const [answer, clue] of [
    ['HALFMOON', 'Certain fish in the subfamily Scorpidinae, such as'],
    ['SCHELLY', 'Fish, the powan'],
    ['FISHERY', 'Place related to fishing, particularly'],
    ['BRAAI', 'Meat cooked by this method'],
    ['ALFREDO', 'Any dish of this type'],
    ['AEGEAN', 'Relating to the Bronze Age civilization in that region'],
    ['STRIPEY', 'Any fish in the kyphosid subfamily Microcanthinae'],
    ['THEATRE', 'Alternative spelling of theater']
  ]) assert.equal(isWordEntryAcceptable({ answer, clue }).reason, 'low-quality', clue);
});

test('blocks inflected explicit words in hints and answers', () => {
  for (const hint of ['Act of masturbating', 'Pornographic material', 'House of prostitution']) {
    assert.equal(isWordEntryAcceptable({ answer: 'CLOPPING', clue: 'Sound of horse hooves', hint }).reason, 'profanity');
  }
  assert.equal(isWordEntryAcceptable({ answer: 'BROTHELS', clue: 'House of prostitution' }).ok, false);
});

test('keeps ordinary standalone marine clues and helpful same-sense hints', () => {
  assert.equal(isWordEntryAcceptable({ answer: 'CRAB',
    clue: 'Sea creature with claws and a sideways walk',
    hint: 'You might find one in a rock pool.' }).ok, true);
});

test('quarantines old dictionary hints until their sense has been reviewed', async () => {
  const { hasReliableHint } = await import('../scripts/clueQuality.js');
  const word = { answer: 'RETORT', clue: 'Pressure cooker', hint: 'Sharp or witty reply', source: 'ml' };
  assert.equal(hasReliableHint(word), false);
  assert.equal(hasReliableHint({ ...word, hint: '', hintSource: 'spelling' }), false);
  assert.equal(hasReliableHint({ ...word, hint: 'Starts with R and ends with T.', hintSource: 'spelling' }), true);
});
