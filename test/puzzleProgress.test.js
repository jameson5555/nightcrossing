import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getPuzzleStatus } from '../src/utils/puzzleProgress.js';
import { getSolvedClueIds } from '../src/utils/crossword.js';

test('Food 12 stays completed when its completion record exists and saved cells differ', () => {
  const puzzle = JSON.parse(fs.readFileSync(
    new URL('../public/data/puzzles/food---cooking-vol12.json', import.meta.url)));
  const oldAnswers = Array(puzzle.grid.length).fill('');
  oldAnswers[0] = 'G';
  oldAnswers[1] = 'R';
  assert.equal(getPuzzleStatus(oldAnswers, puzzle.grid), 'In Progress');
  assert.equal(getPuzzleStatus(oldAnswers, puzzle.grid, true), 'Completed');
  assert.equal(getPuzzleStatus(null, puzzle.grid, true), 'Completed');
});

test('new, incomplete, incorrect and solved grids have distinct statuses', () => {
  const grid = ['C', '.', 'A', 'T'];
  assert.equal(getPuzzleStatus(null, grid), 'New');
  assert.equal(getPuzzleStatus(['', 'X', '', ''], grid), 'New');
  assert.equal(getPuzzleStatus(['C', '', '', ''], grid), 'In Progress');
  assert.equal(getPuzzleStatus(['C', '', 'A', 'R'], grid), 'In Progress');
  assert.equal(getPuzzleStatus(['c', '', 'a', 't'], grid), 'Completed');
  assert.equal(getPuzzleStatus(['X'], ['.']), 'New');
});

test('completion status agrees with solved clues throughout the current catalog', () => {
  const directory = new URL('../public/data/puzzles/', import.meta.url);
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.json'))) {
    const puzzle = JSON.parse(fs.readFileSync(new URL(file, directory)));
    assert.equal(getPuzzleStatus(puzzle.grid, puzzle.grid), 'Completed', file);
    assert.equal(getSolvedClueIds(puzzle, puzzle.grid).size,
      puzzle.answers.across.length + puzzle.answers.down.length, file);
  }
});
