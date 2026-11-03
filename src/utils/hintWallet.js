// One persisted record makes a reward and its receipt inseparable. All balance
// changes use this queue, rather than reading a stale React state snapshot.
export const MAX_HINT_BALANCE = 20;

export function createHintWallet({ read, write, readLegacy }) {
  let queue = Promise.resolve();
  const serialized = (operation) => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const load = async () => {
    let wallet = await read();
    if (!wallet) {
      const legacy = await readLegacy();
      wallet = { balance: Number.isSafeInteger(legacy) && legacy >= 0 ? legacy : 5, receipts: [] };
    }
    if (wallet.balance > MAX_HINT_BALANCE) {
      wallet = { ...wallet, balance: MAX_HINT_BALANCE };
      await write(wallet);
    }
    return wallet;
  };
  const change = async (delta, receipt) => {
    if (!Number.isSafeInteger(delta)) throw new Error('Invalid hint change');
    const wallet = await load();
    if (receipt && wallet.receipts.includes(receipt)) return { balance: wallet.balance, added: 0 };
    if (wallet.balance + delta < 0) return null;
    const added = delta > 0 ? Math.min(delta, Math.max(0, MAX_HINT_BALANCE - wallet.balance)) : 0;
    const next = {
      balance: wallet.balance + (delta > 0 ? added : delta),
      receipts: receipt ? [...wallet.receipts, receipt].slice(-512) : wallet.receipts,
    };
    await write(next);
    return { balance: next.balance, added };
  };
  return {
    balance: () => serialized(async () => (await load()).balance),
    change: (delta, receipt) => serialized(async () => (await change(delta, receipt))?.balance ?? null),
    award: (amount, receipt) => serialized(async () => {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid hint award');
      return change(amount, receipt);
    }),
  };
}
