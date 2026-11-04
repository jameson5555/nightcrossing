import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePlayer } from './PlayerContext.js';
import './AccountPanel.css';

export default function AccountPanel() {
  const { controller } = usePlayer();
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [open, setOpen] = useState(false);
  const [importGuest, setImportGuest] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
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
  const download = async () => {
    const raw = await controller.exportSave();
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `nightcrossing-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const archived = Object.entries(state.archives).flatMap(([id, versions]) =>
    Object.entries(versions).map(([edition, records]) => ({ id, edition,
      letters: JSON.parse(records[`puzzle_progress_${id}`]?.value || '[]').filter(Boolean).length })));
  return <section className="account-panel" aria-label="Account and cloud saves">
    <div>
      <span className="account-status" role="status">{cloudCopy}</span>
      {state.user && <span className="account-name">{state.user.displayName || state.user.email}</span>}
    </div>
    <button ref={triggerRef} type="button" className="account-trigger" onClick={() => setOpen(true)}>
      {state.user ? 'Account' : 'Save across devices'}
    </button>
    {open && <dialog ref={dialogRef} className="account-dialog" onCancel={event => {
      if (busy) event.preventDefault(); else setOpen(false);
    }}>
      <div className="account-dialog-heading">
        <h2>{state.user ? 'Your account' : 'Keep your progress'}</h2>
        <button type="button" aria-label="Close account window" disabled={busy} onClick={() => setOpen(false)}>×</button>
      </div>
      {state.user ? <>
        <p>Signed in as <strong>{state.user.email || state.user.displayName}</strong>.</p>
        <p>Your puzzles, hints, and achievements are saved to this account. You can keep playing offline and sync when you reconnect.</p>
        <p role="status">{cloudCopy}</p>
        {(state.cloud === 'pending' || state.cloud === 'error') && <p className="account-small">Some changes are only on this device. If you sign out now, sign back in here later to finish syncing them.</p>}
        <div className="account-actions">
          <button type="button" disabled={busy || state.cloud === 'saving'} onClick={() => { void run(controller.sync); }}>Sync now</button>
          <button type="button" disabled={busy} onClick={() => { void run(download); }}>Download a backup</button>
          <button type="button" disabled={busy} onClick={() => { void run(controller.signOut); }}>Sign out</button>
        </div>
        <p className="account-small">Signing out returns to this device’s separate guest progress. Your account save stays private to your Google sign-in.</p>
        {archived.length > 0 && <details className="account-versions">
          <summary>Other saved puzzle versions ({archived.length})</summary>
          <p>These puzzles were started on different editions. Both saves were kept. Choose a version to continue from its saved letters.</p>
          {archived.map(({ id, edition, letters }) => <div key={`${id}:${edition}`}>
            <span>{id.replace(/---/g, ' · ').replace(/-vol/, ' · Puzzle ').replace(/-/g, ' ')} — {letters} filled cells</span>
            <button type="button" disabled={busy} onClick={() => { void run(() => controller.chooseEdition(id, edition)); }}>Use this saved version</button>
          </div>)}
        </details>}
        {confirmDelete ? <div className="account-delete-confirm">
          <p>Delete your account and its cloud save? This removes the account’s cached save from this device too. Guest progress is kept. Download a backup first if you want a copy.</p>
          <button type="button" disabled={busy} onClick={() => { void run(controller.deleteAccount); }}>Confirm deletion with Google</button>
          <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep my account</button>
        </div> : <button type="button" className="account-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete account and cloud save</button>}
      </> : <>
        <p>Sign in with Google to keep your puzzles, hints, and achievements across browsers and devices. Playing without an account is still available.</p>
        <label className="account-import"><input type="checkbox" checked={importGuest} onChange={event => setImportGuest(event.target.checked)} />
          Add this device’s guest progress to my account
        </label>
        <p className="account-small">Existing completions are combined. A guest save is only added once and is never automatically copied into another person’s account.</p>
        <button type="button" className="account-google" disabled={busy || !state.available} onClick={() => {
          void run(() => controller.signIn({ importGuest }));
        }}>Continue with Google</button>
        {!state.available && <p>Google sign-in is not available on this site yet.</p>}
        <p className="account-small">Sign in with Google to save progress with Nightcrossing. See our <a href={`${import.meta.env.BASE_URL}privacy.html`}>privacy notice</a>.</p>
      </>}
      {(error || state.message) && <p className="account-error" role="alert">{error || state.message}</p>}
    </dialog>}
    {state.message && !open && <p className="account-error" role="alert">{state.message}</p>}
  </section>;
}
