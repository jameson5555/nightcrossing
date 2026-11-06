import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from '../src/analytics/events.js';

const puzzle = { id: 'space-vol1', theme: 'Space', difficulty: 'Easy' };
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const harness = () => {
  const browser = { dataLayer: [], localStorage: memory() };
  return { browser, analytics: createAnalytics({ enabled: true, browser }) };
};
const names = browser => browser.dataLayer.map(item => item.event);

test('browsing an empty puzzle emits nothing; first input and solve emit once each', () => {
  const { browser, analytics } = harness();
  const session = analytics.openPuzzle(puzzle, { answers: ['', ''] });
  session.update(['', ''], false);
  assert.deepEqual(names(browser), []);
  session.update(['A', ''], false);
  session.update(['A', ''], false); // Repeated React effects do not count twice.
  session.update(['A', 'B'], true);
  session.update(['A', 'B'], true);
  assert.deepEqual(names(browser), ['level_start', 'level_end']);
  assert.equal(browser.dataLayer[1].success, true);
  assert.equal(browser.dataLayer[0].puzzle_theme, 'Space');
  assert.equal(browser.dataLayer[0].puzzle_difficulty, 'Easy');
});

test('reopening erased progress resumes rather than restarting, including after a reload', () => {
  const { browser, analytics } = harness();
  const session = analytics.openPuzzle(puzzle);
  session.update(['A'], false);
  session.update([''], false);
  session.close();
  // A new module instance simulates the persistent marker surviving a reload.
  const reloaded = createAnalytics({ enabled: true, browser });
  reloaded.openPuzzle(puzzle, { answers: [''] }).update(['B'], false);
  assert.deepEqual(names(browser), ['level_start', 'puzzle_resume']);
});

test('existing saved progress emits a resume, then a completion, without a new start', () => {
  const { browser, analytics } = harness();
  const session = analytics.openPuzzle(puzzle, { answers: ['A', ''] });
  session.update(['A', 'B'], true);
  assert.deepEqual(names(browser), ['puzzle_resume', 'level_end']);
});

test('saved completed puzzles and reopening a newly completed puzzle do not emit gameplay events', () => {
  const { browser, analytics } = harness();
  analytics.openPuzzle(puzzle, { completed: true }).update(['A'], true);
  assert.deepEqual(names(browser), []);
  const other = { ...puzzle, id: 'space-vol2' };
  const session = analytics.openPuzzle(other);
  session.update(['A'], true);
  createAnalytics({ enabled: true, browser }).openPuzzle(other).update(['A'], true);
  assert.deepEqual(names(browser), ['level_start', 'level_end']);
});

test('closed sessions cannot emit late events, and profiles keep independent puzzle markers', () => {
  const { browser, analytics } = harness();
  const session = analytics.openPuzzle(puzzle);
  session.close();
  session.update(['A'], true);
  assert.deepEqual(names(browser), []);
  analytics.openPuzzle(puzzle, { profile: 'alice' }).update(['A'], true);
  analytics.openPuzzle(puzzle, { profile: 'bob' }).update(['A'], false);
  assert.deepEqual(names(browser), ['level_start', 'level_end', 'level_start']);
});

test('auth receipts deduplicate reloads, reject unconfirmed events, and clear puzzle parameters', () => {
  const { browser, analytics } = harness();
  analytics.openPuzzle(puzzle).update(['A'], true);
  analytics.accountAuth('sign_up', 'receipt-1');
  createAnalytics({ enabled: true, browser }).accountAuth('sign_up', 'receipt-1');
  analytics.accountAuth(null, 'old-server');
  analytics.accountAuth('login', null);
  analytics.accountAuth('login', 'receipt-2');
  assert.deepEqual(names(browser), ['level_start', 'level_end', 'sign_up', 'login']);
  const event = browser.dataLayer[2];
  assert.equal(event.method, 'Google');
  assert.equal(event.puzzle_id, undefined);
  assert.equal(event.success, undefined);
  assert.doesNotMatch(JSON.stringify(browser.dataLayer), /receipt-1|receipt-2/);
});

test('only puzzle metadata is sent, regardless of private fields in the source objects', () => {
  const { browser, analytics } = harness();
  analytics.openPuzzle({ ...puzzle, uid: 'private-account', email: 'private@example.test',
    title: 'private title', grid: ['SECRET'], difficulty: 'X'.repeat(150) },
  { profile: 'private-account' }).update(['SECRET'], true);
  const payload = JSON.stringify(browser.dataLayer);
  assert.doesNotMatch(payload, /private|SECRET|grid|answers/);
  assert.equal(browser.dataLayer[0].puzzle_difficulty.length, 100);
});

test('blocked storage and a broken data layer never interrupt gameplay or sign-in', () => {
  const browser = {
    get localStorage() { throw new Error('storage blocked'); },
    dataLayer: { push() { throw new Error('tag blocked'); } },
  };
  const analytics = createAnalytics({ enabled: true, browser });
  assert.doesNotThrow(() => {
    const session = analytics.openPuzzle(puzzle);
    session.update(['A'], false);
    session.update(['A'], true);
    analytics.accountAuth('sign_up', 'receipt');
  });
});

test('disabled builds neither emit events nor persist tracking markers', () => {
  const browser = { dataLayer: [], localStorage: { getItem() { assert.fail('must not read'); },
    setItem() { assert.fail('must not write'); } } };
  const analytics = createAnalytics({ browser });
  analytics.openPuzzle(puzzle).update(['A'], true);
  analytics.accountAuth('sign_up', 'receipt');
  assert.deepEqual(names(browser), []);
});
