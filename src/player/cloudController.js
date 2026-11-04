import { createProfileStore, readGuestProgress } from './profileStore.js';
import { createPendingSessionScope, createSessionScope } from './sessionScope.js';
import { cloudSnapshot, emptySnapshot, mergeSnapshots, serializeSnapshot } from './progressMerge.js';
import { hasSavedProgress } from './savedProgress.js';

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
  const initial = config.enabled ? createPendingSessionScope() : null;
  let state = { enabled: config.enabled, available: false, phase: config.enabled ? 'loading' : 'ready', user: null,
    cloud: 'off', message: '', epoch: 0, scope: initial?.scope || createSessionScope(backing), archives: {}, lastSavedAt: null };
  const listeners = new Set();
  const emit = patch => {
    state = { ...state, ...patch };
    if (state.phase === 'ready') initial?.restore(state.scope);
    for (const listener of listeners) listener();
  };
  let backend, startPromise, profile, generation = 0, playing = false;
  let importRequested = null, deleting = false, recovering = false, pendingRemote;
  let dirty = 0, inFlight, debounce, deadline;
  const clearTimers = () => { clearTimeout(debounce); clearTimeout(deadline); debounce = deadline = null; };
  const backupBrowserMerge = async (uid, account, guest) => {
    const key = `nc_browser_recovery_backup_${uid}`;
    const { value } = await backing.get({ key });
    if (!value) await backing.set({ key, value: JSON.stringify({ schemaVersion: 1, createdAt: now(), account, guest }) });
  };
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
    if (!profile || !state.user || deleting || recovering || !backend) return;
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
    const requestedImport = importRequested;
    importRequested = null;
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
      const { value: owner } = await backing.get({ key: 'nc_guest_progress_owner' });
      const declinedKey = `nc_guest_import_declined_${user.uid}`;
      const { value: declined } = await backing.get({ key: declinedKey });
      // Sign-in carries the browser save with it. Restoring an existing session
      // does the same for this owner, even if an old import marker was set.
      // Never attach a guest save reserved by another account automatically.
      if (requestedImport === false && (!owner || owner === user.uid)) {
        await backing.set({ key: declinedKey, value: 'true' });
      }
      const shouldImport = requestedImport === true ||
        (requestedImport === null && !declined);
      if (shouldImport && (!owner || owner === user.uid)) {
        const guest = await readGuestProgress(backing);
        const before = await store.snapshot();
        if (serializeSnapshot(mergeSnapshots(before, guest)) !== serializeSnapshot(before)) {
          await backupBrowserMerge(user.uid, before, guest);
        }
        await backing.set({ key: 'nc_guest_progress_owner', value: user.uid });
        await store.merge(guest);
        await backing.set({ key: `nc_guest_imported_${user.uid}`, value: 'true' });
        await backing.remove({ key: declinedKey });
      }
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
          backend.onAuth((user, options) => {
            if (options?.importGuest === true) importRequested = true;
            void transition(user);
          }, error => emit({ phase: 'error', message: messageFor(error) }));
        } catch (error) { emit({ phase: 'error', message: messageFor(error) }); }
      })();
      return startPromise;
    },
    signIn: async ({ importGuest = true } = {}) => {
      if (!backend || playing || recovering) return;
      importRequested = importGuest;
      try { await backend.signIn(); }
      catch (error) { importRequested = null; emit({ message: messageFor(error) }); }
    },
    cancelSignIn: () => backend?.cancelSignIn?.(),
    signOut: async () => {
      if (!backend || playing || deleting || recovering) return;
      await sync();
      try { await backend.signOut(); }
      catch (error) { emit({ message: messageFor(error) }); }
    },
    sync,
    getBrowserSaveRecovery: async () => {
      if (!profile || !state.user) return { available: false };
      const token = generation, uid = state.user.uid, store = profile;
      if (!await hasSavedProgress(backing)) return { available: false };
      const guest = await readGuestProgress(backing);
      const local = await store.snapshot();
      const { value: owner } = await backing.get({ key: 'nc_guest_progress_owner' });
      return { available: token === generation && serializeSnapshot(mergeSnapshots(local, guest)) !== serializeSnapshot(local),
        differentOwner: Boolean(owner && owner !== uid) };
    },
    exportBrowserSave: async () => serializeSnapshot(await readGuestProgress(backing)),
    recoverBrowserSave: async ({ allowDifferentOwner = false } = {}) => {
      if (!profile || !state.user || playing || deleting || recovering) throw new Error('Open Account from the menu to recover this browser save.');
      const token = generation, uid = state.user.uid, store = profile;
      recovering = true;
      clearTimers();
      emit({ phase: 'loading', message: '' });
      let stopped = false;
      try {
        await inFlight;
        if (token !== generation) throw new Error('The account changed. Open Account and try again.');
        const { value: owner } = await backing.get({ key: 'nc_guest_progress_owner' });
        if (owner && owner !== uid && !allowDifferentOwner) throw new Error('Confirm that this browser save is yours before adding it to another account.');
        if (!await hasSavedProgress(backing)) throw new Error('No saved browser progress was found.');
        const guest = await readGuestProgress(backing);
        await state.scope.stop();
        stopped = true;
        const before = await store.snapshot();
        // Keep an immutable pre-recovery copy on this device. Failure to save
        // that backup aborts recovery before the account is changed.
        await backupBrowserMerge(uid, before, guest);
        if (token !== generation) throw new Error('The account changed. Open Account and try again.');
        await store.merge(guest);
        dirty++;
        // An explicit recovery can retry even when the old once-only import
        // marker was set. It never deletes or changes the guest puzzle data.
        if (!owner) await backing.set({ key: 'nc_guest_progress_owner', value: uid });
        await backing.set({ key: `nc_guest_imported_${uid}`, value: 'true' });
        await backing.remove({ key: `nc_guest_import_declined_${uid}` });
        emit({ cloud: 'pending', message: '' });
      } catch (error) {
        if (token === generation) emit({ cloud: 'error', message: error.message });
        throw error;
      } finally {
        recovering = false;
        if (stopped && token === generation) {
          const saved = await store.snapshot();
          emit({ phase: 'ready', scope: createSessionScope(store), epoch: state.epoch + 1, archives: saved.archives });
        } else if (token === generation) {
          emit({ phase: 'ready' });
        }
      }
      await sync();
    },
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
      if (!profile || !state.user || playing || deleting || recovering) return;
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
        await backing.remove({ key: `nc_browser_recovery_backup_${uid}` });
        const { value: owner } = await backing.get({ key: 'nc_guest_progress_owner' });
        if (owner === uid) await backing.remove({ key: 'nc_guest_progress_owner' });
        await backing.remove({ key: `nc_guest_imported_${uid}` });
        await backing.remove({ key: `nc_guest_import_declined_${uid}` });
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
