# Google sign-in and cloud saves

The web app supports optional Google sign-in through Firebase Authentication and
private progress documents in Cloud Firestore. Guest play remains available.
The feature is disabled until a Firebase project and its access rules are ready.
No live Firebase project has been created or connected by this change.

## Connect a Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
   Choose the **Spark** plan. Analytics, Cloud Functions, Storage, phone sign-in,
   and a billing account are not needed for this implementation. Keep billing
   upgrades off unless you deliberately choose them later. Usage is subject to
   the [Spark quotas](https://firebase.google.com/pricing); reaching a quota can
   interrupt sync, while local saves remain available.
2. Under **Build → Authentication → Sign-in method**, enable Google. Select a
   public project name and support email. Under Authentication's authorized
   domains, add `jamesonmacarthur.com`. Add `localhost` and `127.0.0.1` only if you
   need local testing against the live project. Keep Google's default basic
   profile scopes; the app requests no email-message, contacts, or calendar access.
3. Create a **Cloud Firestore Standard edition** database in production mode.
   Choose the location appropriate for your players before creating it. Publish
   the contents of [firestore.rules](../firebase/firestore.rules) using the
   database's Rules tab. Do not use public read/write or temporary test-mode rules.
4. Register a **Web app** in Project settings. Copy its public `apiKey`,
   `authDomain`, `projectId`, and `appId` into the environment settings below.
   Keep Firebase's generated `authDomain` for the popup sign-in flow. These are
   public web configuration values; never add a service-account private key or
   Google OAuth client secret to a `VITE_` variable.
5. Check the Google OAuth consent-screen configuration if Google keeps the app
   in testing mode: add the intended test users or complete the appropriate
   publishing setup. Test with both existing players before enabling the feature
   on the public build.

Local `.env.local` values:

```dotenv
VITE_CLOUD_SAVE_ENABLED=true
VITE_FIREBASE_API_KEY=your-public-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=your-web-app-id
```

For deployed builds, set these GitHub repository **variables**:

| Repository variable | Build setting |
| --- | --- |
| `NC_CLOUD_SAVE_ENABLED` | `VITE_CLOUD_SAVE_ENABLED` |
| `NC_FIREBASE_API_KEY` | `VITE_FIREBASE_API_KEY` |
| `NC_FIREBASE_AUTH_DOMAIN` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `NC_FIREBASE_PROJECT_ID` | `VITE_FIREBASE_PROJECT_ID` |
| `NC_FIREBASE_APP_ID` | `VITE_FIREBASE_APP_ID` |

Both normal web deployment and monthly puzzle deployment use the same settings.
Leave `NC_CLOUD_SAVE_ENABLED=false` until the rules and real Google sign-in have
been tested. Rebuild after changing variables. Existing cPanel hosting stays in
place; Firebase hosts authentication and saves, not the game files.

If using the Firebase CLI, review the target project before deploying rules and
indexes:

```sh
npx firebase-tools@14.27.0 login
npx firebase-tools@14.27.0 deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

The index configuration excludes the serialized progress payload from indexes.
All app reads use the exact `/players/{uid}` document; browsing the collection
and accessing another account's document are denied.

## What players experience

- **Save across devices** opens Google sign-in from the menu. An account is never
  required to solve puzzles.
- The import checkbox adds this device's guest progress once to its first linked
  account. Guest data stays intact. Later accounts on that browser do not
  automatically receive someone else's guest save.
- Signed-in accounts have separate local caches. Signing out returns to the
  separate guest save. Cached account data can be recovered after an interrupted
  connection by signing back into that same account.
- Sync attempts start shortly after a pause in local changes, or after 15 seconds
  of continuous changes, and on returning to the menu. Focus, reconnection, and a
  visible-page check every minute also trigger sync. **Sync now** requests one
  immediately. The UI distinguishes local-only changes from a successful cloud
  save. Closing a browser before upload can leave the latest changes only on that
  device; sign back in there to finish syncing.
- Independent cell edits combine. Each cell has its own edit stamp, including
  deliberate erasures. Completed grids and completion credit are preserved.
- Hint changes carry unique events and reward receipts. Reconnecting devices
  combines spends and earnings and deduplicates the same reward. This remains a
  client-managed game wallet, not a purchase-verified currency system.
- Progress for different puzzle editions never mixes. The more advanced saved
  edition is initially retained, with completion credit preserved. Other versions
  stay in the account and can be selected under **Other saved puzzle versions**.
- Remote changes wait until the player leaves an active puzzle. Revoked screen
  scopes prevent late callbacks from overwriting restored data or another account.
- Players can download a JSON backup. Account deletion reauthenticates with Google,
  deletes the cloud document and Firebase account, and clears that account's local
  cache on this device. An error is reported if deletion does not finish; the
  original guest save is retained.

The [privacy notice](../public/privacy.html) describes optional account data and
cloud storage. Review the deployed Firebase project settings and notice together
before enabling accounts.

## Local emulator verification

These commands use a demo project and no real accounts or billable backend:

```sh
npx firebase-tools@14.27.0 emulators:start --only auth,firestore --project demo-nightcrossing
npm run test:firebase-rules
```

The emulators listen on `127.0.0.1:9198` for Authentication and
`127.0.0.1:8188` for Firestore. For the local Vite app, set:

```dotenv
VITE_CLOUD_SAVE_ENABLED=true
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=localhost
VITE_FIREBASE_PROJECT_ID=demo-nightcrossing
VITE_FIREBASE_APP_ID=demo-app
VITE_FIREBASE_EMULATORS=true
```

Then run `npm run dev`. Emulator connections are development-only and ignored
by production builds. Use fictional Google accounts in the emulator popup.

The ordinary `npm test` suite verifies migration, cell conflicts, erasures,
completion preservation, edition archives, wallet merging, offline retries,
account isolation, stale callbacks, and deletion. The separate rules test uses
the actual Firestore emulator to check owner access, cross-account denial,
signed-out denial, payload limits, timestamps, and revision preconditions.

## Android

This change enables accounts for browsers, including mobile browsers. The native
Android build keeps accounts disabled. Before enabling them in a Play release,
integrate native Google sign-in with a Capacitor bridge and pass its credential
to Firebase Authentication. Register the Android app and signing fingerprints in
the same Firebase project, supply its native configuration, and test on devices.
Google's browser popup flow must not be used inside an Android WebView. The
backend save format and merge logic can be reused for that integration.

## Implementation notes

Firebase is loaded only when account features are enabled. Progress uses one
private document with an optimistic transaction; retries merge against the latest
server copy instead of replacing it blindly. The client refuses to upload more
than 750,000 bytes and retains the local copy if syncing fails. No save history is
silently truncated to meet the size limit. Firebase 12 and its shared app packages
are pinned to compatible versions for the project's Node 22 workflows; the gRPC
dependency is constrained to a patched version.

Primary references: [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin),
[Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions),
[access rules](https://firebase.google.com/docs/firestore/security/rules-conditions),
[rules emulator](https://firebase.google.com/docs/firestore/security/test-rules-emulator).

## Verification completed locally

- All 107 ordinary automated tests pass; the production build and lint checks for
  changed application code pass.
- All five access-rule tests pass against the Firestore emulator.
- An isolated Chrome session at a 390-pixel viewport completed the Google emulator
  sign-in, imported legacy guest progress, saved a newly typed letter, signed out
  without changing the guest copy, restored the save in a fresh browser, retained
  sign-in after reload, and deleted the fictional account. No browser page errors
  occurred. The account dialog was visually checked at the same size.
- Real Google OAuth and production Firestore remain unverified until the owner's
  Firebase project is connected. Nothing has been deployed.
