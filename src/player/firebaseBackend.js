import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, connectAuthEmulator,
  signOut, reauthenticateWithPopup, deleteUser } from 'firebase/auth';
import { getFirestore, doc, runTransaction, serverTimestamp, deleteDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { decodeSnapshot, emptySnapshot, mergeSnapshots, serializeSnapshot } from './progressMerge.js';

export function createFirebaseBackend(config) {
  const app = initializeApp(config, 'nightcrossing-accounts');
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9198');
    connectFirestoreEmulator(db, '127.0.0.1', 8188);
  }
  const pending = new Set();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const accountDoc = uid => doc(db, 'players', uid);
  const assertUser = uid => {
    if (auth.currentUser?.uid !== uid) throw new Error('Sign in again before syncing this account.');
  };
  return {
    onAuth: (changed, failed) => onAuthStateChanged(auth, changed, failed),
    signIn: () => signInWithPopup(auth, provider),
    signOut: () => signOut(auth),
    merge: (uid, local) => {
      assertUser(uid);
      const operation = runTransaction(db, async transaction => {
        assertUser(uid);
        const ref = accountDoc(uid);
        const saved = await transaction.get(ref);
        const data = saved.exists() ? saved.data() : null;
        if (data && (data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision))) {
          throw new Error('This cloud save uses an unsupported version. Your local progress is safe.');
        }
        const remote = data ? decodeSnapshot(data.payload) : emptySnapshot();
        const combined = mergeSnapshots(remote, local);
        const payload = serializeSnapshot(combined);
        if (new TextEncoder().encode(payload).length > 750000) {
          throw new Error('Your cloud save is too large. Download a backup and contact support.');
        }
        if (!data || payload !== data.payload) transaction.set(ref, {
          schemaVersion: 1, payload, revision: (data?.revision || 0) + 1,
          updatedAt: serverTimestamp()
        });
        return combined;
      }, { maxAttempts: 3 });
      pending.add(operation);
      operation.then(() => pending.delete(operation), () => pending.delete(operation));
      return operation;
    },
    deleteAccount: async uid => {
      assertUser(uid);
      // Reauthenticate before deleting either resource so recent-login errors
      // cannot erase the save while leaving the account unexpectedly active.
      await reauthenticateWithPopup(auth.currentUser, provider);
      await Promise.allSettled([...pending]);
      assertUser(uid);
      await deleteDoc(accountDoc(uid));
      await deleteUser(auth.currentUser);
    }
  };
}
