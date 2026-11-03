import test from 'node:test';
import assert from 'node:assert/strict';
import { createHintWallet } from '../src/utils/hintWallet.js';

function fixture(balance, legacy = 5, receipts = []) {
  let stored = balance === undefined ? undefined : { balance, receipts };
  const io = {
    read: async () => stored,
    write: async value => { stored = structuredClone(value); },
    readLegacy: async () => legacy,
  };
  return { wallet: createHintWallet(io), restart: () => createHintWallet(io), snapshot: () => structuredClone(stored) };
}

test('completion rewards fill only the available space and cannot be reclaimed after spending', async () => {
  const { wallet, restart } = fixture(18);
  assert.deepEqual(await wallet.award(5, 'puzzle:a'), { balance: 20, added: 2 });
  assert.equal(await wallet.change(-4), 16);
  assert.deepEqual(await restart().award(5, 'puzzle:a'), { balance: 16, added: 0 });
  assert.deepEqual(await wallet.award(5, 'puzzle:b'), { balance: 20, added: 4 });
});

test('rewards at the cap are consumed without credit or a deferred payout', async () => {
  const { wallet, restart } = fixture(20);
  assert.deepEqual(await wallet.award(1, 'timer:a'), { balance: 20, added: 0 });
  assert.deepEqual(await wallet.award(5, 'puzzle:a'), { balance: 20, added: 0 });
  assert.equal(await wallet.change(-1), 19);
  assert.deepEqual(await restart().award(1, 'timer:a'), { balance: 19, added: 0 });
  assert.deepEqual(await wallet.award(5, 'puzzle:a'), { balance: 19, added: 0 });
  assert.deepEqual(await wallet.award(1, 'timer:b'), { balance: 20, added: 1 });
});

test('loading an existing balance above 20 persists the cap and preserves reward receipts', async () => {
  const { wallet, restart, snapshot } = fixture(55, 5, ['puzzle:old']);
  assert.equal(await wallet.balance(), 20);
  assert.deepEqual(snapshot(), { balance: 20, receipts: ['puzzle:old'] });
  assert.equal(await restart().balance(), 20);
  assert.deepEqual(await wallet.award(5, 'puzzle:a'), { balance: 20, added: 0 });
  assert.equal(await wallet.change(-1), 19);
  assert.deepEqual(await wallet.award(5, 'puzzle:old'), { balance: 19, added: 0 });
  assert.deepEqual(await wallet.award(5, 'puzzle:b'), { balance: 20, added: 1 });
});

test('legacy balances above 20 migrate to a persisted capped wallet', async () => {
  const { wallet, restart, snapshot } = fixture(undefined, 100);
  assert.equal(await wallet.balance(), 20);
  assert.deepEqual(snapshot(), { balance: 20, receipts: [] });
  assert.equal(await wallet.change(-1), 19);
  assert.equal(await restart().balance(), 19);
  assert.equal(await wallet.change(1, 'ad:a'), 20);
});

test('spending before reading a large balance applies the cap first', async () => {
  const { wallet } = fixture(55);
  assert.equal(await wallet.change(-1), 19);
});

test('loading balances at or below the cap and the initial allowance leaves them unchanged', async () => {
  for (const balance of [0, 5, 19, 20]) {
    const { wallet } = fixture(balance);
    assert.equal(await wallet.balance(), balance);
  }
  assert.equal(await fixture().wallet.balance(), 5);
});

test('simultaneous completion, timer and ad rewards respect the cap and receipt deduplication', async () => {
  const { wallet } = fixture(19);
  const results = await Promise.all([
    wallet.award(5, 'puzzle:a'), wallet.award(1, 'timer:a'),
    wallet.change(1, 'ad:a'), wallet.change(-1), wallet.change(1, 'ad:a'),
  ]);
  assert.deepEqual(results, [{ balance: 20, added: 1 }, { balance: 20, added: 0 }, 20, 19, 19]);
  assert.equal(await wallet.balance(), 19);
});

test('invalid awards and overspending leave the wallet usable', async () => {
  const { wallet } = fixture(3);
  await assert.rejects(wallet.award(-1), /Invalid hint award/);
  await assert.rejects(wallet.award(1.5), /Invalid hint award/);
  assert.equal(await wallet.change(-4), null);
  assert.equal(await wallet.balance(), 3);
  assert.deepEqual(await wallet.award(5, 'puzzle:a'), { balance: 8, added: 5 });
});
