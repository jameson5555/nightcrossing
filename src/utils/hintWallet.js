// One persisted record makes a reward and its receipt inseparable. All balance
// changes use this queue, rather than reading a stale React state snapshot.
export function createHintWallet({ read, write, readLegacy }) {
  let queue = Promise.resolve();
  const serialized = (operation) => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const load = async () => {
    const record = await read();
    if (record) return record;
    const legacy = await readLegacy();
    return { balance: Number.isSafeInteger(legacy) && legacy >= 0 ? legacy : 5, receipts: [] };
  };
  return {
    balance: () => serialized(async () => (await load()).balance),
    change: (delta, receipt) => serialized(async () => {
      if (!Number.isSafeInteger(delta)) throw new Error('Invalid hint change');
      const wallet = await load();
      if (receipt && wallet.receipts.includes(receipt)) return wallet.balance;
      if (wallet.balance + delta < 0) return null;
      const next = {
        balance: wallet.balance + delta,
        receipts: receipt ? [...wallet.receipts, receipt].slice(-512) : wallet.receipts,
      };
      await write(next);
      return next.balance;
    }),
  };
}
