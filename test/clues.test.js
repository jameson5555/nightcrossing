import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getClueText } from '../src/utils/clues.js';

test('top bar preserves the complete Sports 16 and Animals 8 clues', () => {
  for (const [id, expected] of [
    ['sports---athletics-vol16', 'St. Louis baseball team named after red birds'],
    ['animals---wildlife-vol8', 'Lithograph print by the Dutch artist M. C. Escher first printed in March 1943']
  ]) {
    const puzzle = JSON.parse(fs.readFileSync(
      new URL(`../public/data/puzzles/${id}.json`, import.meta.url)));
    const clue = puzzle.clues.across.find(clue => clue.startsWith('5.'));
    assert.equal(getClueText(clue), expected);
  }
});

test('removes only an initial clue number, retaining internal punctuation', () => {
  assert.equal(getClueText('12. First sentence. Second sentence.'), 'First sentence. Second sentence.');
  assert.equal(getClueText('12.5 km race'), '5 km race');
  assert.equal(getClueText('St. Louis team'), 'St. Louis team');
  assert.equal(getClueText(null), null);
});

test('all catalog clue bodies appear in full', () => {
  const directory = new URL('../public/data/puzzles/', import.meta.url);
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.json'))) {
    const puzzle = JSON.parse(fs.readFileSync(new URL(file, directory)));
    for (const direction of ['across', 'down']) {
      for (const clue of puzzle.clues[direction]) {
        const prefix = clue.match(/^\d+\.\s*/);
        assert.ok(prefix, `${file}: numbered clue`);
        assert.equal(getClueText(clue), clue.slice(prefix[0].length), `${file}: ${clue}`);
      }
    }
  }
});
