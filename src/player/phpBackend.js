import { decodeSnapshot, emptySnapshot, mergeSnapshots, serializeSnapshot } from './progressMerge.js';

const errorWith = (message, code) => Object.assign(new Error(message), { code });
const validUser = user => user && /^g_[a-f0-9]{32}$/.test(user.uid) &&
  typeof user.email === 'string' && typeof user.displayName === 'string';

export function createPhpBackend({ endpoint }, {
  fetcher = globalThis.fetch, browser = globalThis.window, cache = globalThis.localStorage,
  completionPollMs = 1500, signInTimeoutMs = 180000
} = {}) {
  let user = null, csrf = '', changed, loginAttempt = null;
  let deleting = false, cancelPopup, resumingRedirect = false, outboundIntent = null;
  const pending = new Set();
  const cacheKey = `nc_php_user_v1:${endpoint}`;
  const guestKey = `${cacheKey}:guest`;
  const redirectKey = `${cacheKey}:redirect`;
  const redirectIntent = () => {
    try {
      const intent = JSON.parse(cache.getItem(redirectKey)) || outboundIntent;
      return typeof intent?.attempt === 'string' && intent.attempt && Number.isFinite(intent.created) &&
        Date.now() >= intent.created && Date.now() - intent.created <= 300000 ? intent : null;
    } catch { return null; }
  };
  const forgetRedirect = () => { outboundIntent = null; try { cache.removeItem(redirectKey); } catch { /* optional cache */ } };
  const prefersGuest = () => { try { return cache.getItem(guestKey) === 'true'; } catch { return false; } };
  const confirmRedirect = (next, intent = redirectIntent()) => {
    if (!next || !intent || intent.attempt !== loginAttempt) return false;
    forgetRedirect();
    return true;
  };
  const guestPreference = value => { try { if (value) cache.setItem(guestKey, 'true'); else cache.removeItem(guestKey); } catch { /* optional */ } };
  const remember = next => {
    user = next;
    // This is only a local profile hint, never a credential or authorization.
    try { if (next) cache.setItem(cacheKey, JSON.stringify(next)); else cache.removeItem(cacheKey); } catch { /* optional cache */ }
  };
  const request = async (action, { body, uid } = {}) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    const url = `${endpoint}?action=${action}${uid ? `&uid=${encodeURIComponent(uid)}` : ''}`;
    try {
      const response = await fetcher(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
        cache: 'no-store', signal: abort.signal,
        headers: body ? { 'Content-Type': 'application/json', 'X-NC-CSRF': csrf } : {},
        ...(body ? { body: JSON.stringify(body) } : {}) });
      let data;
      try { data = await response.json(); } catch { throw errorWith('Account saves returned an invalid response. Your local progress is safe.', 'unavailable'); }
      if (!response.ok) throw errorWith(data.error || 'Account saves could not be reached.', response.status >= 500 ? 'unavailable' : `http-${response.status}`);
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        throw errorWith('Account saves are unavailable. Your progress remains on this device.', 'unavailable');
      }
      throw error;
    } finally { clearTimeout(timer); }
  };
  const session = async () => {
    const data = await request('session');
    if (typeof data.csrf !== 'string' || (data.user !== null && !validUser(data.user))) {
      throw errorWith('Account session could not be read.', 'unavailable');
    }
    csrf = data.csrf;
    loginAttempt = data.loginAttempt;
    return data.user;
  };
  const assertUser = uid => {
    if (user?.uid !== uid) throw errorWith('Sign in again before syncing this account.', 'http-401');
  };
  const redirectSignIn = async () => {
    cancelPopup?.();
    let cancel;
    const cancelled = new Promise((resolve, reject) => {
      cancel = () => reject(errorWith('Google sign-in was cancelled.', 'popup-closed'));
    });
    cancelPopup = cancel;
    try {
      await Promise.race([session(), cancelled]);
      const authorization = await Promise.race([
        request('authorize', { body: { reauthenticate: false, redirect: true } }), cancelled
      ]);
      if (typeof authorization.url !== 'string' || !authorization.url.startsWith('https://accounts.google.com/') ||
          typeof authorization.attempt !== 'string' || !authorization.attempt || authorization.mode !== 'redirect') {
        throw new Error('Google sign-in could not be started. Please try again later.');
      }
      // This is a local import intent, never an authentication credential. The
      // returning server session must confirm this exact authorization attempt.
      const intent = { attempt: authorization.attempt, created: Date.now() };
      cache.setItem(redirectKey, JSON.stringify(intent));
      outboundIntent = intent;
      guestPreference(false);
      browser.location.assign(authorization.url);
    } finally {
      if (cancelPopup === cancel) cancelPopup = null;
    }
  };
  const popup = reauthenticate => {
    cancelPopup?.();
    // Open synchronously from the click to avoid popup blocking while loading.
    const popupWindow = browser.open('about:blank', 'nightcrossing-google', 'popup,width=520,height=680');
    if (!popupWindow) return Promise.reject(errorWith('Allow popups, then try Google sign-in again.', 'popup-blocked'));
    return new Promise((resolve, reject) => {
      let finished = false, poll, timeout, attempt, checking = false;
      const cancel = () => finish(errorWith('Google sign-in was cancelled.', 'popup-closed'));
      const finish = (error, next) => {
        if (finished) return;
        finished = true;
        clearInterval(poll); clearTimeout(timeout);
        browser.removeEventListener('message', onMessage);
        browser.removeEventListener('focus', check);
        browser.document?.removeEventListener('visibilitychange', check);
        if (cancelPopup === cancel) cancelPopup = null;
        try { popupWindow.close(); } catch { /* Mobile browsers may detach the popup. */ }
        if (error) { reject(error); return; }
        if (!reauthenticate) { guestPreference(false); remember(next); changed?.(next); }
        resolve();
      };
      const check = async () => {
        if (finished || !attempt || checking) return;
        checking = true;
        try {
          const next = await session();
          if (finished || !next || loginAttempt !== attempt) return;
          if (reauthenticate && next.uid !== user?.uid) {
            finish(new Error('Choose the same Google account to confirm deletion.'));
            return;
          }
          finish(null, next);
        } catch { /* A dropped check retries; it cannot authenticate or erase progress. */ }
        finally { checking = false; }
      };
      const onMessage = event => {
        if (event.origin !== browser.location.origin || event.source !== popupWindow ||
            event.data?.type !== 'nightcrossing-auth') return;
        if (event.data.ok) void check();
        else finish(new Error(event.data.error || 'Google sign-in could not be completed.'));
      };
      cancelPopup = cancel;
      browser.addEventListener('message', onMessage);
      browser.addEventListener('focus', check);
      browser.document?.addEventListener('visibilitychange', check);
      // Chrome can sever the opener and report window.closed while the login
      // tab is still open. Complete only when our server confirms this attempt.
      // Recheck immediately when a backgrounded mobile game becomes active.
      poll = setInterval(() => { void check(); }, completionPollMs);
      timeout = setTimeout(() => finish(errorWith(
        'Google sign-in did not finish. Close the Google tab, return to Nightcrossing, and try again.',
        'popup-timeout')), signInTimeoutMs);
      void (async () => {
        try {
          const current = await session();
          if (reauthenticate && current?.uid !== user?.uid) throw new Error('Sign in again before deleting this account.');
          const authorization = await request('authorize', { body: { reauthenticate, uid: user?.uid } });
          const { url } = authorization;
          if (typeof url !== 'string' || !url.startsWith('https://accounts.google.com/') ||
              typeof authorization.attempt !== 'string' || !authorization.attempt) {
            throw new Error('Google sign-in returned an invalid response.');
          }
          if (!finished) {
            attempt = authorization.attempt;
            popupWindow.location.href = url;
          }
        } catch (error) { finish(error); }
      })();
    });
  };
  const merge = async (uid, local) => {
    assertUser(uid);
    if (deleting) throw new Error('This account is being deleted.');
    const current = await session();
    if (current?.uid !== uid) throw errorWith('Sign in again before syncing this account.', 'http-401');
    let saved = await request('save', { uid });
    for (let attempt = 0; attempt < 5; attempt++) {
      assertUser(uid);
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 0 ||
          !(saved.payload === null || typeof saved.payload === 'string')) throw new Error('Invalid account save. Your local progress is safe.');
      const remote = saved.payload === null ? emptySnapshot() : decodeSnapshot(saved.payload);
      const combined = mergeSnapshots(remote, local);
      const payload = serializeSnapshot(combined);
      if (new TextEncoder().encode(payload).length > 750000) throw new Error('Your account save is too large. Download a backup and contact support.');
      if (payload === saved.payload) return combined;
      try {
        await request('write', { body: { uid, revision: saved.revision, payload } });
        return combined;
      } catch (error) {
        if (error.code !== 'http-409') throw error;
        saved = await request('save', { uid });
      }
    }
    throw new Error('Another device is saving right now. Your progress is safe here; sync again shortly.');
  };
  return {
    onAuth: (callback, failed) => {
      changed = callback;
      try { if (cache.getItem(guestKey) === 'true') { changed(null); return () => { changed = null; }; } } catch { /* optional */ }
      void session().then(next => {
        const importGuest = confirmRedirect(next);
        remember(next); changed?.(next, { importGuest });
      }, error => {
        if (error.code === 'unavailable') {
          let cached;
          try { cached = JSON.parse(cache.getItem(cacheKey)); } catch { /* no usable cache */ }
          user = validUser(cached) ? cached : null;
          changed?.(user);
        } else failed(error);
      });
      return () => { changed = null; };
    },
    resumeSignIn: async () => {
      const intent = redirectIntent();
      if (!intent || resumingRedirect || deleting || !changed || prefersGuest()) return false;
      resumingRedirect = true;
      try {
        const next = await session();
        // A page restored from browser history still has its old guest state.
        // Confirm the exact attempt again, including after an offline return.
        // Sign-out or a newer attempt invalidates this in-flight check.
        if (prefersGuest() || redirectIntent()?.attempt !== intent.attempt || !confirmRedirect(next, intent)) return false;
        guestPreference(false);
        remember(next); changed?.(next, { importGuest: true });
        return true;
      } catch { return false; }
      finally { resumingRedirect = false; }
    },
    signIn: ({ mode = 'redirect' } = {}) => mode === 'popup' ? popup(false) : redirectSignIn(),
    cancelSignIn: () => cancelPopup?.(),
    signOut: async () => {
      forgetRedirect();
      try { await session(); await request('logout', { body: {} }); }
      catch { /* Offline sign-out still returns to guest; server cookie expires separately. */ }
      guestPreference(true);
      remember(null); changed?.(null);
    },
    merge: (uid, local) => {
      const operation = merge(uid, local);
      pending.add(operation);
      operation.then(() => pending.delete(operation), () => pending.delete(operation));
      return operation;
    },
    deleteAccount: async uid => {
      assertUser(uid);
      deleting = true;
      try {
        await popup(true);
        await Promise.allSettled([...pending]);
        assertUser(uid);
        await request('delete', { body: { uid } });
        guestPreference(true);
        forgetRedirect();
        remember(null);
        // Controller clears the account's device cache before installing guest.
      } finally { deleting = false; }
    }
  };
}
