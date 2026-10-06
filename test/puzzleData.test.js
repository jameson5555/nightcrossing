import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPuzzleData } from '../src/utils/puzzleData.js';

test('catalog versions bypass old cached puzzle files and reuse matching versions', async (t) => {
  const cache = new Map();
  const requests = [];
  let publishedGrid = 'old-grid';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (options.cache === 'no-store' || !cache.has(url)) cache.set(url, publishedGrid);
    return { ok: true, json: async () => cache.get(url) };
  });
  const path = 'puzzles/food---cooking-vol12.json';
  assert.equal(await fetchPuzzleData(path, { fresh: false }), 'old-grid');
  publishedGrid = 'replacement-grid';
  assert.equal(await fetchPuzzleData(path, { fresh: false, version: 'replacement' }), 'replacement-grid');
  assert.equal(await fetchPuzzleData(path, { fresh: false, version: 'replacement' }), 'replacement-grid');
  assert.equal(requests[1].url, requests[2].url);
  assert.notEqual(requests[0].url, requests[1].url);
  assert.equal(new URL(requests[1].url, 'https://example.test').searchParams.get('v'), 'replacement');
});

test('fresh play requests bypass cached files and encode the catalog version', async (t) => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ id: 'test' }) };
  });
  assert.deepEqual(await fetchPuzzleData('puzzles/test.json', { version: 'a & b' }), { id: 'test' });
  const url = new URL(request.url, 'https://example.test');
  assert.equal(url.searchParams.get('v'), 'a & b');
  assert.ok(url.searchParams.get('t'));
  assert.equal(request.options.cache, 'no-store');
});
