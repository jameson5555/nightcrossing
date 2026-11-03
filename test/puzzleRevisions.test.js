import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePuzzleRevisions, recordDatasetVersion } from '../src/utils/puzzleRevisions.js';

function memoryStore(initial) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: async ({ key }) => ({ value: values.get(key) || null }),
    set: async ({ key, value }) => values.set(key, value),
    remove: async ({ key }) => values.delete(key)
  };
}

test('catalog revisions preserve cells, hints, completions, theme counts and the wallet', async () => {
  const store = memoryStore({
    puzzle_progress_ocean15: 'old cells', unlocked_hints_ocean15: 'old clue numbers',
    revealed_indices_ocean15: '[3]', reward_claimed_ocean15: 'true',
    free_hint_claimed_ocean15: 'true', theme_progress_Ocean: 'old completion count',
    puzzle_progress_ocean14: 'keep cells', reward_claimed_ocean14: 'true',
    hint_wallet_v1: 'keep wallet', journey_rank_high_watermark: 'keep rank'
  });
  const before = new Map(store.values);
  assert.deepEqual(await reconcilePuzzleRevisions(store, {
    ocean15: { revision: 'new-grid', theme: 'Ocean' }
  }), ['ocean15']);
  for (const [key, value] of before) assert.equal(store.values.get(key), value, key);

  store.values.set('puzzle_progress_ocean15', 'new cells');
  assert.deepEqual(await reconcilePuzzleRevisions(store, {
    ocean15: { revision: 'new-grid', theme: 'Ocean' }
  }), []);
  assert.equal(store.values.get('puzzle_progress_ocean15'), 'new cells');
  assert.deepEqual(await reconcilePuzzleRevisions(store, {
    ocean15: { revision: 'another-grid', theme: 'Ocean' }
  }), ['ocean15']);
  assert.equal(store.values.get('puzzle_progress_ocean15'), 'new cells');
});

test('metadata without replacements leaves all progress intact', async () => {
  const store = memoryStore({ puzzle_progress_original: 'keep' });
  assert.deepEqual(await reconcilePuzzleRevisions(store), []);
  assert.equal(store.values.get('puzzle_progress_original'), 'keep');
});

test('a catalog version change never clears puzzle editions, hints, ranks or completion', async () => {
  const store = memoryStore({
    puzzle_dataset_version: 'older-version', puzzle_progress_original: '["C", "", ""]',
    puzzle_edition_original: '"original"', reward_claimed_other: 'true',
    free_hint_claimed_original: 'true', hint_wallet_v1: '{"balance":8}',
    theme_progress_Test: '{"completed":true}', journey_rank_high_watermark: '4',
    hints_empty_timestamp: '12345'
  });
  const before = new Map(store.values);
  assert.equal(await recordDatasetVersion(store, 'new-version'), true);
  for (const [key, value] of before) {
    if (key !== 'puzzle_dataset_version') assert.equal(store.values.get(key), value, key);
  }
  assert.equal(await recordDatasetVersion(store, 'new-version'), false);
  assert.equal(await recordDatasetVersion(store, ''), false);
});
