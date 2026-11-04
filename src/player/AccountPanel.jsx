import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePlayer } from './PlayerContext.js';
import { hasSavedProgress } from './savedProgress.js';
import './AccountPanel.css';

export default function AccountPanel() {
  const { controller } = usePlayer();
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setBusy] = useState(false);
  const busy = working || state.phase !== 'ready';
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [guestHasProgress, setGuestHasProgress] = useState(false);
  const [browserRecovery, setBrowserRecovery] = useState(null);
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open || !state.user) return;
    let active = true;
    void controller.getBrowserSaveRecovery().then(recovery => {
      if (active) setBrowserRecovery(recovery);
    }).catch(() => {
      if (active) setError('The separate browser save could not be read. Its data has been left unchanged.');
    });
    return () => { active = false; };
  }, [controller, open, state.user]);
  useEffect(() => {
    if (!state.enabled || state.user) return;
    let active = true;
    void hasSavedProgress(state.scope).then(hasProgress => {
      if (active) setGuestHasProgress(hasProgress);
    }).catch(() => { /* Keep the basic sign-in link if local storage cannot be read. */ });
    return () => { active = false; };
  }, [state.enabled, state.scope, state.user]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, [open]);
  if (!state.enabled) return null;
  const run = async action => {
    setBusy(true);
    setError('');
    try { await action(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const cloudCopy = { off: 'Progress saved on this device', saving: 'Saving to your account…',
    saved: 'Progress saved to your account', pending: 'Saved on this device · cloud save pending',
    error: 'Saved on this device · cloud save needs attention' }[state.cloud];
  const label = state.user ? 'Account' : guestHasProgress ? 'Save progress' : 'Sign in';
  const needsAttention = state.user && (state.cloud === 'pending' || state.cloud === 'error');
  const download = async (browserSave = false) => {
    const raw = await (browserSave ? controller.exportBrowserSave() : controller.exportSave());
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `nightcrossing-${browserSave ? 'browser-' : ''}save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const archived = Object.entries(state.archives).flatMap(([id, versions]) =>
    Object.entries(versions).map(([edition, records]) => ({ id, edition,
      letters: JSON.parse(records[`puzzle_progress_${id}`]?.value || '[]').filter(Boolean).length })));
  return <div className="account-panel">
    <button ref={triggerRef} type="button"
      className={`account-trigger${!state.user && guestHasProgress ? ' account-trigger-save' : ''}`}
      aria-haspopup="dialog" aria-expanded={open}
      aria-label={needsAttention ? `${label} · ${cloudCopy}` : label}
      title={state.user ? cloudCopy : guestHasProgress ? 'Sign in to keep your progress across devices' : 'Restore your account on this device'}
      onClick={() => setOpen(true)}>
      {!state.user && guestHasProgress && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 18H6a4 4 0 0 1-.8-7.9A7 7 0 0 1 19 9a4.5 4.5 0 0 1 0 9h-2" />
        <path d="M12 20V11m-3 3 3-3 3 3" />
      </svg>}
      {label}
      {needsAttention && <span className="account-attention-dot" aria-hidden="true" />}
    </button>
    {open && <dialog ref={dialogRef} className="account-dialog" onCancel={event => {
      if (busy) event.preventDefault(); else setOpen(false);
    }}>
      <div className="account-dialog-heading">
        <h2>{state.user ? 'Your account' : 'Keep your progress'}</h2>
        <button type="button" aria-label="Close account window" disabled={busy} onClick={() => setOpen(false)}>×</button>
      </div>
      {state.user ? <>
        <p><strong>{state.user.email || state.user.displayName}</strong></p>
        <p role="status">{cloudCopy}</p>
        <div className="account-actions">
          {state.cloud === 'error' && <button type="button" disabled={busy} onClick={() => { void run(controller.sync); }}>Retry save</button>}
          <button type="button" disabled={busy} onClick={() => { void run(controller.signOut); }}>Sign out</button>
        </div>
      </> : <>
        <p>Sign in to keep your progress across devices.</p>
        <button type="button" className="account-google" disabled={busy || !state.available} onClick={() => {
          setSigningIn(true);
          void run(() => controller.signIn()).finally(() => setSigningIn(false));
        }}>Continue with Google</button>
        {signingIn && <div className="account-signing-in">
          <span className="account-small" role="status">Waiting for Google…</span>
          <button type="button" onClick={controller.cancelSignIn}>Cancel</button>
        </div>}
        {!state.available && <p>Google sign-in is not available yet.</p>}
        <p className="account-small"><a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a></p>
      </>}
      {(state.user || guestHasProgress) && <details className="account-options">
        <summary>More options</summary>
        <div className="account-actions">
          {state.user && <>
            <button type="button" disabled={busy || state.cloud === 'saving'} onClick={() => { void run(controller.sync); }}>Sync now</button>
            <button type="button" disabled={busy} onClick={() => { void run(() => download()); }}>Download a backup</button>
          </>}
          {(!state.user || browserRecovery?.available) && <button type="button" disabled={busy} onClick={() => { void run(() => download(true)); }}>Download browser backup</button>}
        </div>
        {state.user && browserRecovery?.available && <section className="account-browser-recovery" aria-label="Recover browser progress">
          <p>Another browser save is available. Add it to this account?</p>
          {browserRecovery.differentOwner ? <>
            {confirmRecovery ? <>
              <p>This save was linked to another account. Confirm it belongs to you before adding it to <strong>{state.user.email || state.user.displayName}</strong>.</p>
              <button type="button" disabled={busy} onClick={() => { void run(() => controller.recoverBrowserSave({ allowDifferentOwner: true })); }}>Confirm and add browser progress</button>
              <button type="button" disabled={busy} onClick={() => setConfirmRecovery(false)}>Cancel</button>
            </> : <button type="button" disabled={busy} onClick={() => setConfirmRecovery(true)}>Add browser progress to account</button>}
          </> : <button type="button" disabled={busy} onClick={() => { void run(controller.recoverBrowserSave); }}>Add browser progress to account</button>}
        </section>}
        {state.user && archived.length > 0 && <details className="account-versions">
          <summary>Other saved puzzle versions ({archived.length})</summary>
          <p>Choose a version to continue from its saved letters.</p>
          {archived.map(({ id, edition, letters }) => <div key={`${id}:${edition}`}>
            <span>{id.replace(/---/g, ' · ').replace(/-vol/, ' · Puzzle ').replace(/-/g, ' ')} — {letters} filled cells</span>
            <button type="button" disabled={busy} onClick={() => { void run(() => controller.chooseEdition(id, edition)); }}>Use this saved version</button>
          </div>)}
        </details>}
        {state.user && (confirmDelete ? <div className="account-delete-confirm">
          <p>Delete your account and cloud save? Guest progress stays on this device.</p>
          <button type="button" disabled={busy} onClick={() => { void run(controller.deleteAccount); }}>Confirm deletion with Google</button>
          <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep my account</button>
        </div> : <button type="button" className="account-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete account and cloud save</button>)}
      </details>}
      {(error || state.message) && <p className="account-error" role="alert">{error || state.message}</p>}
    </dialog>}
    {state.message && !open && <span className="account-sr-only" role="status">{state.message}</span>}
  </div>;
}
