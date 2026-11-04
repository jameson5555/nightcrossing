import { createProfileStore, readGuestProgress } from './profileStore.js';
import { createSessionScope } from './sessionScope.js';
import { cloudSnapshot, emptySnapshot, mergeSnapshots, serializeSnapshot } from './progressMerge.js';

const messageFor = error => {
  const code = error?.code || '';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'Sign-in was cancelled. Your progress is still on this device.';
  if (code.includes('popup-blocked')) return 'Allow popups for this site, then try Google sign-in again.';
  if (code.includes('unauthorized-domain')) return 'Google sign-in is not enabled for this website yet.';
  if (code.includes('http-401')) return 'Your login session has expired. Your progress is safe here. Sign out and sign in again to resume saving.';
  if (code.includes('network') || code.includes('unavailable') || code === 'sync-timeout') return 'Cloud saves are unavailable right now. Your progress is saved on this device and will retry when you reconnect.';
  return error?.message || 'Cloud saves could not be reached. Your progress is still saved on this device.';
};

const timed = (promise, milliseconds = 12000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error('Cloud save timed out.'), { code: 'sync-timeout' })), milliseconds);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

export function createCloudController({ backing, config, backendFactory,
  device = globalThis.crypto.randomUUID(), now = Date.now, debounceMs = 2000, maxWaitMs = 15000 }) {
  let state = { enabled: config.enabled, available: false, phase: config.enabled ? 'loading' : 'ready', user: null,
    cloud: 'off', message: '', epoch: 0, scope: createSessionScope(backing), archives: {}, lastSavedAt: null };
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  let backend, startPromise, profile, generation = 0, playing = false;
  let importRequested = false, deleting = false, pendingRemote;
  let dirty = 0, inFlight, debounce, deadline;
  const clearTimers = () => { clearTimeout(debounce); clearTimeout(deadline); debounce = deadline = null; };
  const schedule = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { void sync(); }, debounceMs);
    deadline ||= setTimeout(() => { void sync(); }, maxWaitMs);
  };
  const installRemote = async (remote, token) => {
    if (token !== generation || !profile) return;
    const local = await profile.snapshot();
    const combined = mergeSnapshots(local, remote);
    if (serializeSnapshot(combined) === serializeSnapshot(local)) return;
    await state.scope.stop();
    try { await profile.merge(remote); }
    finally {
      if (token === generation) {
        const next = await profile.snapshot();
        emit({ scope: createSessionScope(profile), epoch: state.epoch + 1, archives: next.archives });
      }
    }
  };
  async function sync() {
    if (!profile || !state.user || deleting || !backend) return;
    if (inFlight) return inFlight;
    clearTimers();
    const token = generation, uid = state.user.uid, store = profile, capturedDirty = dirty;
    emit({ cloud: 'saving', message: '' });
    const operation = (async () => {
      try {
        const local = cloudSnapshot(await store.snapshot());
        const merged = await timed(backend.merge(uid, local));
        if (token !== generation) return;
        if (playing) pendingRemote = mergeSnapshots(pendingRemote || emptySnapshot(), merged);
        else await installRemote(merged, token);
        if (token !== generation) return;
        emit({ cloud: dirty === capturedDirty ? 'saved' : 'pending', lastSavedAt: now(), message: '' });
        if (dirty !== capturedDirty) schedule();
      } catch (error) {
        if (token === generation) emit({ cloud: 'error', message: messageFor(error) });
      }
    })();
    inFlight = operation;
    await operation;
    if (inFlight === operation) inFlight = null;
  }
  const transition = async user => {
    const token = ++generation;
    clearTimers();
    inFlight = null;
    pendingRemote = null;
    playing = false;
    emit({ phase: 'loading', message: '' });
    await state.scope.stop();
    if (token !== generation) return;
    profile = null;
    if (!user) {
      emit({ phase: 'ready', user: null, cloud: 'off', scope: createSessionScope(backing),
        epoch: state.epoch + 1, archives: {}, lastSavedAt: null });
      return;
    }
    try {
      const store = createProfileStore({ backing, uid: user.uid, device, now,
        onChange: () => {
          if (token !== generation || deleting) return;
          dirty++;
          if (state.cloud !== 'pending') emit({ cloud: 'pending' });
          schedule();
        } });
      await store.snapshot();
      if (importRequested) {
        const { value: owner } = await backing.get({ key: 'nc_guest_progress_owner' });
        const { value: imported } = await backing.get({ key: `nc_guest_imported_${user.uid}` });
        if ((!owner || owner === user.uid) && !imported) {
          await backing.set({ key: 'nc_guest_progress_owner', value: user.uid });
          await store.merge(await readGuestProgress(backing));
          await backing.set({ key: `nc_guest_imported_${user.uid}`, value: 'true' });
        }
      }
      importRequested = false;
      if (token !== generation) return;
      profile = store;
      const saved = await store.snapshot();
      emit({ user: { uid: user.uid, displayName: user.displayName, email: user.email },
        scope: createSessionScope(store), epoch: state.epoch + 1, archives: saved.archives, cloud: 'saving' });
      await sync();
      if (token === generation) emit({ phase: 'ready' });
    } catch (error) {
      if (token === generation) emit({ phase: 'error', message: messageFor(error) });
    }
  };
  return {
    getState: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    start: () => {
      if (!config.enabled) return Promise.resolve();
      if (startPromise) return startPromise;
      startPromise = (async () => {
        emit({ phase: 'loading' });
        try {
          if (!config.configured) throw new Error('Account saves are enabled but the API path is invalid.');
          backend = await backendFactory(config.backend);
          emit({ available: true });
          backend.onAuth(user => { void transition(user); }, error => emit({ phase: 'error', message: messageFor(error) }));
        } catch (error) { emit({ phase: 'error', message: messageFor(error) }); }
      })();
      return startPromise;
    },
    signIn: async ({ importGuest = true } = {}) => {
      if (!backend || playing) return;
      importRequested = importGuest;
      try { await backend.signIn(); }
      catch (error) { importRequested = false; emit({ message: messageFor(error) }); }
    },
    cancelSignIn: () => backend?.cancelSignIn?.(),
    signOut: async () => {
      if (!backend || playing || deleting) return;
      await sync();
      try { await backend.signOut(); }
      catch (error) { emit({ message: messageFor(error) }); }
    },
    sync,
    setPlaying: async value => {
      playing = value;
      if (!value && pendingRemote) {
        const pending = pendingRemote;
        pendingRemote = null;
        try { await installRemote(pending, generation); }
        catch (error) { emit({ cloud: 'error', message: messageFor(error) }); }
      }
      if (!value && profile) void sync();
    },
    chooseEdition: async (id, edition) => {
      if (!profile || playing) return;
      await state.scope.stop();
      try { await profile.chooseEdition(id, edition); }
      finally {
        const saved = await profile.snapshot();
        emit({ scope: createSessionScope(profile), epoch: state.epoch + 1, archives: saved.archives });
      }
      await sync();
    },
    deleteAccount: async () => {
      if (!profile || !state.user || playing || deleting) return;
      const store = profile, uid = state.user.uid;
      deleting = true;
      clearTimers();
      await state.scope.stop();
      emit({ phase: 'loading' });
      try {
        // Finish an already submitted write before deleting the document.
        await inFlight;
        await backend.deleteAccount(uid);
        await store.clear();
        const { value: owner } = await backing.get({ key: 'nc_guest_progress_owner' });
        if (owner === uid) await backing.remove({ key: 'nc_guest_progress_owner' });
        await backing.remove({ key: `nc_guest_imported_${uid}` });
        await transition(null);
      } catch (error) {
        emit({ phase: 'ready', scope: createSessionScope(store), epoch: state.epoch + 1,
          cloud: 'error', message: messageFor(error) });
      } finally { deleting = false; }
    },
    useGuest: async () => {
      if (backend) {
        try { await backend.signOut(); } catch { /* A local-only guest remains available. */ }
      }
      await transition(null);
    },
    exportSave: async () => profile ? serializeSnapshot(await profile.snapshot()) :
      serializeSnapshot(await readGuestProgress(backing))
  };
}
