// Revoke an old screen's writes before switching profiles or installing remote
// progress. Late React effects can never write into a different player's save.
export function createPendingSessionScope() {
  let restore;
  const ready = new Promise(resolve => { restore = resolve; });
  return {
    restore,
    scope: createSessionScope({
      get: async args => (await ready).get(args),
      keys: async () => (await ready).keys(),
      // Startup effects belong to the placeholder screen. Only the mounted
      // screen for the resolved player may change progress.
      set: async () => {}, remove: async () => {}
    })
  };
}

export function createSessionScope(store) {
  let active = true;
  const pending = new Set();
  const write = (method, args) => {
    if (!active) return Promise.resolve();
    const operation = Promise.resolve().then(() => store[method](args));
    pending.add(operation);
    operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  };
  return {
    get: args => store.get(args), keys: () => store.keys(),
    set: args => write('set', args), remove: args => write('remove', args),
    stop: async () => { active = false; await Promise.allSettled([...pending]); }
  };
}
