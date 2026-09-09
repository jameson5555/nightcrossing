// Provider contract: prepare(signal) -> { show(onReward), cancel() }.
// show resolves after dismissal and returns completed/dismissed/failed.
export function createRewardedHints({ provider, credit, timeoutMs = 15000 }) {
  let state = 'idle';
  let session;
  let abort;
  let generation = 0;
  let pendingReceipt;
  const listeners = new Set();
  const publish = (next) => { state = next; listeners.forEach(fn => fn(next)); };
  const cancel = () => {
    if (state === 'showing') return;
    generation++;
    abort?.abort();
    session?.cancel();
    session = undefined;
    publish('idle');
  };
  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    cancel,
    async prepare() {
      if (['loading', 'ready', 'showing'].includes(state)) return;
      if (!pendingReceipt && globalThis.navigator?.onLine === false) { publish('unavailable'); return; }
      const run = ++generation;
      abort = new AbortController();
      publish('loading');
      let timer;
      try {
        // Retry a failed local save with the same receipt, never another ad.
        if (pendingReceipt) {
          await credit(pendingReceipt);
          pendingReceipt = undefined;
          if (run === generation) publish('completed');
          return;
        }
        const prepared = await Promise.race([
          provider.prepare(abort.signal),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Ad timeout')), timeoutMs); }),
        ]);
        if (run !== generation) { prepared?.cancel(); return; }
        session = prepared;
        publish(session ? 'ready' : 'unavailable');
      } catch {
        abort.abort();
        if (run === generation) publish(pendingReceipt ? 'save-failed' : 'unavailable');
      } finally { clearTimeout(timer); }
    },
    async show() {
      if (state !== 'ready' || !session) return;
      publish('showing');
      const receipt = `ad:${globalThis.crypto.randomUUID()}`;
      let saving;
      const reward = () => {
        if (saving) return;
        pendingReceipt = receipt;
        saving = Promise.resolve().then(() => credit(receipt)).then(() => { pendingReceipt = undefined; });
        // The SDK can notify reward before its dismissal promise settles.
        saving.catch(() => {});
      };
      try {
        const outcome = await session.show(reward);
        await saving;
        publish(saving ? 'completed' : outcome);
      } catch {
        publish(pendingReceipt ? 'save-failed' : 'failed');
      } finally {
        session.cancel();
        session = undefined;
      }
    },
  };
}
