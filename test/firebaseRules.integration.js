import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-nightcrossing',
    firestore: { host: '127.0.0.1', port: 8188,
      rules: fs.readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8') } });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
const save = overrides => ({ schemaVersion: 1, payload: '{"schemaVersion":1,"clock":0,"records":{},"archives":{},"choices":{}}',
  revision: 1, updatedAt: serverTimestamp(), ...overrides });

test('an authenticated owner can create, read, update and delete their own save', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  const ref = doc(db, 'players', 'alice');
  await assertSucceeds(setDoc(ref, save()));
  assert.equal((await assertSucceeds(getDoc(ref))).data().revision, 1);
  await assertSucceeds(setDoc(ref, save({ revision: 2 })));
  await assertSucceeds(deleteDoc(ref));
});

test('signed-out visitors cannot read or write player saves', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'players', 'alice')));
  await assertFails(setDoc(doc(db, 'players', 'alice'), save()));
});

test('another signed-in player cannot read, overwrite or delete someone else’s save', async () => {
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'players', 'alice'), save()));
  const db = environment.authenticatedContext('bob').firestore();
  await assertFails(getDoc(doc(db, 'players', 'alice')));
  await assertFails(setDoc(doc(db, 'players', 'alice'), save({ revision: 2 })));
  await assertFails(deleteDoc(doc(db, 'players', 'alice')));
});

test('player collections and unrelated paths cannot be listed or accessed', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  await assertFails(getDocs(collection(db, 'players')));
  await assertFails(setDoc(doc(db, 'other', 'alice'), save()));
  await assertFails(getDoc(doc(db, 'other', 'alice')));
});

test('malformed fields, oversized data, stale timestamps and revision jumps are rejected', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  const ref = doc(db, 'players', 'alice');
  for (const invalid of [save({ extra: 'not allowed' }), save({ schemaVersion: 2 }),
    save({ payload: {} }), save({ payload: 'x'.repeat(750001) }),
    save({ updatedAt: new Date(0) }), save({ revision: 8 })]) await assertFails(setDoc(ref, invalid));
  await assertSucceeds(setDoc(ref, save()));
  await assertFails(setDoc(ref, save({ revision: 1 })));
  await assertFails(setDoc(ref, save({ revision: 3 })));
  await assertSucceeds(setDoc(ref, save({ revision: 2 })));
});
