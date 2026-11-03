import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createPuzzleLoader } from '../src/utils/puzzleEditions.js';
import { getPuzzleStatus } from '../src/utils/puzzleProgress.js';

const baseline = JSON.parse(fs.readFileSync(
  new URL('../docs/historical-puzzle-audit-2026-11-03.json', import.meta.url)));
const dataDir = new URL('../public/data/', import.meta.url);
const loadFile = file => JSON.parse(fs.readFileSync(new URL(file, dataDir)));

test('all pre-cleanup puzzle payloads remain intact and the reset version stays unchanged', () => {
  const meta = loadFile('puzzles.meta.json');
  assert.equal(meta.resetVersion, baseline.preservedResetVersion);
  for (const item of baseline.puzzles) {
    const original = loadFile(`puzzles/${item.id}.json`);
    delete original.currentEdition;
    const hash = createHash('sha256').update(JSON.stringify(original)).digest('hex');
    assert.equal(hash, item.originalContentHash, item.id);
  }
});

test('every historical grid still opens against its saved cells and completion record', async () => {
  for (const item of baseline.puzzles) {
    const original = loadFile(`puzzles/${item.id}.json`);
    const state = new Map([
      [`puzzle_progress_${item.id}`, JSON.stringify(original.grid.map(cell => cell === '.' ? '' : cell))],
      [`reward_claimed_${item.id}`, 'true']
    ]);
    const store = { get: async ({ key }) => ({ value: state.get(key) ?? null }) };
    const load = createPuzzleLoader({ store, fetchData: async file => loadFile(file) });
    const opened = await load(item.id);
    assert.deepEqual(opened.grid, original.grid, item.id);
    assert.deepEqual(opened.gridnums, original.gridnums, item.id);
    assert.equal(getPuzzleStatus(JSON.parse(state.get(`puzzle_progress_${item.id}`)), opened.grid, true),
      'Completed', item.id);
  }
});
