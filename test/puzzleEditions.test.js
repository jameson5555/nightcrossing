import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPuzzleLoader } from '../src/utils/puzzleEditions.js';
import { getPuzzleStatus } from '../src/utils/puzzleProgress.js';
import { readCurrentPuzzle, publishPuzzleEdition } from '../scripts/puzzleCatalog.cjs';

function setup(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  const store = {
    get: async ({ key }) => ({ value: values.get(key) ?? null }),
    set: async ({ key, value }) => values.set(key, value)
  };
  const original = { id: 'old-vol1', theme: 'Test', grid: ['C', 'A', 'T'],
    currentEdition: 'editions/old-vol1-aaa.json' };
  const first = { id: 'old-vol1', theme: 'Test', grid: ['D', 'O', 'G'] };
  const second = { id: 'old-vol1', theme: 'Test', grid: ['O', 'W', 'L'] };
  const files = new Map([
    ['puzzles/old-vol1.json', original],
    ['puzzles/editions/old-vol1-aaa.json', first],
    ['puzzles/editions/old-vol1-bbb.json', second]
  ]);
  const fetchData = async file => {
    if (!files.has(file)) throw new Error('Offline or missing edition');
    return structuredClone(files.get(file));
  };
  return { values, store, original, first, second, files, load: createPuzzleLoader({ store, fetchData }) };
}

test('legacy partial grids keep every cell and purchased or free hint state', async () => {
  const s = setup({ 'puzzle_progress_old-vol1': ['C', '', ''],
    'free_hint_claimed_old-vol1': true, 'unlocked_hints_old-vol1': ['across-1'],
    'revealed_indices_old-vol1': [0], hint_wallet_v1: { balance: 7 },
    journey_rank_high_watermark: 5, theme_progress_Test: { puzzlesCompleted: 3 } });
  const before = new Map(s.values);
  assert.deepEqual((await s.load('old-vol1', { pin: true })).grid, ['C', 'A', 'T']);
  for (const [key, value] of before) assert.equal(s.values.get(key), value, key);
  assert.equal(JSON.parse(s.values.get('puzzle_edition_old-vol1')), 'original');
});

test('completed legacy puzzles remain completed without replaying the replacement', async () => {
  for (const state of [
    { 'reward_claimed_old-vol1': true },
    { 'puzzle_progress_old-vol1': ['C', 'A', 'T'] }
  ]) {
    const s = setup(state);
    const puzzle = await s.load('old-vol1', { pin: true });
    assert.equal(getPuzzleStatus(state['puzzle_progress_old-vol1'], puzzle.grid,
      state['reward_claimed_old-vol1']), 'Completed');
    assert.deepEqual(puzzle.grid, s.original.grid);
  }
});

test('hint use alone pins a legacy puzzle even if the grid is still empty', async () => {
  for (const state of [
    { 'free_hint_claimed_old-vol1': true },
    { 'unlocked_hints_old-vol1': ['down-2'] },
    { 'revealed_indices_old-vol1': [1] }
  ]) assert.deepEqual((await setup(state).load('old-vol1')).grid, ['C', 'A', 'T']);
});

test('new play uses the improved grid and a second update preserves partial progress on it', async () => {
  const s = setup();
  assert.deepEqual((await s.load('old-vol1', { pin: true })).grid, s.first.grid);
  s.values.set('puzzle_progress_old-vol1', JSON.stringify(['D', '', '']));
  s.original.currentEdition = 'editions/old-vol1-bbb.json';
  assert.deepEqual((await s.load('old-vol1', { pin: true })).grid, s.first.grid);
  assert.deepEqual(JSON.parse(s.values.get('puzzle_progress_old-vol1')), ['D', '', '']);
  assert.equal(JSON.parse(s.values.get('puzzle_edition_old-vol1')), 'editions/old-vol1-aaa.json');
});

test('menu scans and opening without starting never prevent a later content upgrade', async () => {
  const s = setup();
  await s.load('old-vol1');
  assert.equal(s.values.has('puzzle_edition_old-vol1'), false);
  await s.load('old-vol1', { pin: true });
  s.values.set('puzzle_progress_old-vol1', JSON.stringify(['', '', '']));
  s.original.currentEdition = 'editions/old-vol1-bbb.json';
  assert.deepEqual((await s.load('old-vol1', { pin: true })).grid, s.second.grid);
});

test('an unavailable pinned edition fails without swapping grids or modifying progress', async () => {
  const s = setup({ 'puzzle_progress_old-vol1': ['D', '', ''],
    'puzzle_edition_old-vol1': 'editions/old-vol1-aaa.json' });
  const before = new Map(s.values);
  s.files.delete('puzzles/editions/old-vol1-aaa.json');
  await assert.rejects(s.load('old-vol1', { pin: true }), /missing edition/);
  assert.deepEqual(s.values, before);
});

test('publishing preserves original URLs and every earlier immutable edition', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-edition-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'old-vol1.json');
  const { original, first, second } = setup();
  delete original.currentEdition;
  fs.writeFileSync(file, JSON.stringify(original));
  const firstPath = publishPuzzleEdition(file, first);
  assert.deepEqual(readCurrentPuzzle(file), first);
  const secondPath = publishPuzzleEdition(file, second);
  assert.notEqual(firstPath, secondPath);
  assert.deepEqual(readCurrentPuzzle(file), second);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, firstPath))), first);
  const legacy = JSON.parse(fs.readFileSync(file));
  delete legacy.currentEdition;
  assert.deepEqual(legacy, original);
});
