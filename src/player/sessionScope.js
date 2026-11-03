// Revoke an old screen's writes before switching profiles or installing remote
// progress. Late React effects can never write into a different player's save.
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
