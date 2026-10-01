import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePuzzleRevisions } from '../src/utils/puzzleRevisions.js';

function memoryStore(initial) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: async ({ key }) => ({ value: values.get(key) || null }),
    set: async ({ key, value }) => values.set(key, value),
    remove: async ({ key }) => values.delete(key)
  };
}

test('replacing a grid clears only its saved state and keeps the hint wallet and other progress', async () => {
  const store = memoryStore({
    puzzle_progress_ocean15: 'old cells', unlocked_hints_ocean15: 'old clue numbers',
    revealed_indices_ocean15: '[3]', reward_claimed_ocean15: 'true',
    free_hint_claimed_ocean15: 'true', theme_progress_Ocean: 'old completion count',
    puzzle_progress_ocean14: 'keep cells', reward_claimed_ocean14: 'true',
    hint_wallet_v1: 'keep wallet', journey_rank_high_watermark: 'keep rank'
  });
  assert.deepEqual(await reconcilePuzzleRevisions(store, {
    ocean15: { revision: 'new-grid', theme: 'Ocean' }
  }), ['ocean15']);
  for (const key of ['puzzle_progress_ocean15', 'unlocked_hints_ocean15',
    'revealed_indices_ocean15', 'reward_claimed_ocean15', 'free_hint_claimed_ocean15',
    'theme_progress_Ocean']) assert.equal(store.values.has(key), false, key);
  assert.equal(store.values.get('puzzle_progress_ocean14'), 'keep cells');
  assert.equal(store.values.get('reward_claimed_ocean14'), 'true');
  assert.equal(store.values.get('hint_wallet_v1'), 'keep wallet');
  assert.equal(store.values.get('journey_rank_high_watermark'), 'keep rank');

  store.values.set('puzzle_progress_ocean15', 'new cells');
  assert.deepEqual(await reconcilePuzzleRevisions(store, {
    ocean15: { revision: 'new-grid', theme: 'Ocean' }
  }), []);
  assert.equal(store.values.get('puzzle_progress_ocean15'), 'new cells');
  assert.deepEqual(await reconcilePuzzleRevisions(store, {
    ocean15: { revision: 'another-grid', theme: 'Ocean' }
  }), ['ocean15']);
  assert.equal(store.values.has('puzzle_progress_ocean15'), false);
});

test('metadata without replacements leaves all progress intact', async () => {
  const store = memoryStore({ puzzle_progress_original: 'keep' });
  assert.deepEqual(await reconcilePuzzleRevisions(store), []);
  assert.equal(store.values.get('puzzle_progress_original'), 'keep');
});
