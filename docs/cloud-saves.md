# Google sign-in and account saves on cPanel

Nightcrossing now uses Google OpenID Connect for identity, PHP 8.4 for sessions,
and MySQL for account saves. Firebase Authentication and Firestore are no longer
used. Guest play and the existing puzzle edition/merge logic remain intact.

The implementation is ready for setup, but no live database or Google credentials
have been connected and nothing has been deployed by this change. Keep
`NC_CLOUD_SAVE_ENABLED=false` until the following steps are complete.

## 1. Create a dedicated database

In cPanel open **Databases → Database Wizard** (older layouts call it **MySQL
Database Wizard**). Create a database such as `nightcrossing`, then a dedicated
user and a generated password. cPanel usually adds an account prefix; retain the
full resulting database and username. Assign the user to that database.

Use phpMyAdmin to select the new database, open **Import**, and import
[server/schema.sql](../server/schema.sql). It creates `nc_players` and `nc_saves`
without dropping tables. Do not import it into an unrelated application's DB.
The runtime user needs SELECT, INSERT, UPDATE and DELETE; importing the schema
also requires CREATE and REFERENCES privileges. The wizard's ALL PRIVILEGES
choice works for initial setup on this dedicated database; privileges can be
narrowed afterward.

Keep the password private. Enter it directly into the private server config in
step 3, never in a Vite variable, GitHub repository variable, or chat message.

PHP needs curl, mbstring, openssl, PDO and pdo_mysql. Your domain is set to PHP 8.4;
if the backend reports unavailable, have the host confirm those extensions and
outbound HTTPS access to accounts.google.com, oauth2.googleapis.com and
www.googleapis.com. The schema supports MySQL 5.7 and MariaDB. Ask the host about
ongoing patches or a newer database version, since standard MySQL 5.7 support has
ended; the screenshot alone does not establish the host's patch arrangements.

## 2. Create Google's login client

You may use the same Google Cloud project you started for Firebase; Firebase
services do not need to be enabled. Open the [Google Cloud console](https://console.cloud.google.com/),
select the intended project, and open **Google Auth Platform** (the older layout
uses APIs & Services → OAuth consent screen / Credentials).

- **Branding:** use Nightcrossing, a support email you control, the homepage
  `https://jamesonmacarthur.com/nightcrossing/`, and privacy URL
  `https://jamesonmacarthur.com/nightcrossing/privacy.html`. Add
  `jamesonmacarthur.com` as an authorized domain where requested.
- **Audience:** choose External for personal Google accounts. While the app is
  in Testing, add both current players as test users. Publish the OAuth app to
  Production when ready for other players and complete any console requirements.
- **Data Access:** only basic OpenID identity, email and profile are requested:
  `openid`, `email`, `profile`. Do not add Gmail, contacts, calendar or Drive scopes.
- **Clients → Create client → Web application:** create a client for Nightcrossing.
  Register this **exact Authorized redirect URI**, including its query string:

  ```text
  https://jamesonmacarthur.com/nightcrossing/api/index.php?action=callback
  ```

This server-based flow does not require Authorized JavaScript origins. Copy the
client ID and client secret into the private PHP config. Neither value needs to
be entered into the frontend build. Do not share the secret or downloaded client
credentials. Google's code exchange and signed ID token verification use the
official Google PHP library, plus state, nonce and PKCE checks. Access and refresh
tokens are not kept after sign-in.

## 3. Install the private backend outside the website

A release package has been prepared at `artifacts/nightcrossing-private.zip`.
Future web deployment workflows also attach a `nightcrossing-private` artifact
to the GitHub Actions run. Downloading a GitHub artifact may add an outer ZIP;
the inner `nightcrossing-private.zip` is the backend package.

In cPanel **File Manager**, go to your account home, one level above
`public_html`. Create `nightcrossing-private`, upload the package into it, and
extract it there. Files should look like:

```text
/home/CPANEL_USER/
  nightcrossing-private/
    config.example.php
    config.php              ← you create this; contains the secrets
    composer.json
    composer.lock
    schema.sql
    src/
    vendor/
    runtime/sessions/       ← PHP creates this
  public_html/
    nightcrossing/
      index.html
      api/index.php         ← public entrypoint; contains no secrets
```

The ZIP's contents go directly inside `nightcrossing-private`; avoid an extra
nested folder. Delete the uploaded ZIP after extraction. Copy
`config.example.php` to **config.php**, then edit the copy:

- Keep `origin` as `https://jamesonmacarthur.com` and `api_path` as
  `/nightcrossing/api/index.php`.
- Keep `development` **false** on your real site.
- Enter the Google client ID and secret from step 2.
- In the database DSN, replace only `REPLACE` after `dbname=` with the full
  prefixed DB name. Keep `charset=utf8mb4`.
- Enter the dedicated DB username and password. This is the DB user's password,
  not your Google or cPanel password.

These files must stay outside public_html and any other public document root.
Use permissions appropriate to your host's PHP user, typically 0700 for the
private directory and 0600 for config.php. PHP must be able to read its files and
create/write runtime/sessions. Do not commit config.php or upload it with FTP to
the game directory. For a nonstandard document root, set server environment
variable `NC_PRIVATE_DIR` to the private directory's absolute path; the default
entrypoint locates it three levels above its api directory.

The private package includes Composer dependencies so Composer/SSH is not needed
on your hosting. It omits unused Google API service wrappers (such as Gmail and
Drive), keeping the package about 1 MB. The package builder tests signed token
verification using the actual extracted package. To rebuild it locally or in CI:

```sh
composer install --working-dir=server --no-dev --prefer-dist --no-interaction
npm run build:accounts
```

For later updates, install matching src/ and vendor/ from the new package before
enabling/deploying dependent frontend changes. Keep config.php and runtime/
intact. FTP deployment updates only the public web files; it cannot install the
private directory above public_html. Schedule database backups through your host.

## 4. Deploy and enable

The normal web build includes the public `api/index.php` entrypoint. Deploy the
web build using the existing workflow. With the private config/schema ready,
visit:

```text
https://jamesonmacarthur.com/nightcrossing/api/index.php?action=session
```

A successful unsigned-in response is JSON containing `user: null`, a random
`csrf` value, and `loginAttempt: null`. It must not display PHP source, SQL errors
or credentials. The CSRF value is not a Google or DB password.

Once that works, set GitHub **Settings → Secrets and variables → Actions →
Variables**:

```text
NC_CLOUD_SAVE_ENABLED=true
```

Run **Deploy Web to cPanel** again. Do not add Google/DB secrets to the frontend
build; remove unused `NC_FIREBASE_*` variables if you created them previously.
For a local frontend build, use `.env.local`:

```dotenv
VITE_CLOUD_SAVE_ENABLED=true
VITE_ACCOUNTS_API_PATH=/nightcrossing/api/index.php
```

The API path must stay on the same origin. Use the canonical domain
`jamesonmacarthur.com`; redirect alternate www/HTTP URLs to it in your hosting if
needed. Allow the sign-in popup when prompted.

## 5. Verify with the two current players

1. Before signing in, use the original browser/device with their saved progress.
   In the menu footer, click **Save progress** (or **Sign in** on a new device).
   Sign in with **Add this device's guest progress to my account** checked.
2. Check that old completions, an in-progress puzzle and hints are retained.
   Return to the menu, open **Account** in the footer, and confirm “Progress saved to your account.” Download a
   backup from Account before any further migration experiments.
3. Sign in on a second browser/device. Confirm the same progress appears.
4. Make different edits on the same edition on the two devices. Sync each from
   the menu and confirm compatible edits merge. An older/newer grid edition is
   retained separately rather than mixing its cells.
5. Sign out and confirm the original guest save still exists. Sign in as the
   other player and confirm they do not receive the first player's guest copy.
6. Try offline play and reconnect; pending edits should save once the server is
   available. A device can restore only edits that have reached the server.
7. Test account deletion with a disposable account. Confirming with a different
   Google account must fail; the intended user's account/save alone is removed.

Existing browser progress is not reset or deleted by this switch. Guest progress
is copied only once into the first linked owner, and completion credit survives
puzzle revisions. Each account has a separate local cache. If someone previously
used a live Firebase account, export its save using the old deployment before
switching: this release does not automatically import Firestore or Firebase UID
caches. The two current players' original guest saves remain available.

## Behavior and limits

- Cell timestamps merge independent edits and deliberate erasures. Completion,
  achievements, hints and reward receipts keep their existing merge policies.
- Different editions are archived; Account lets a player choose which to resume.
- Account IDs are opaque random IDs associated with Google's immutable `sub`,
  not its changeable email address. Every API request checks the session owner.
- Sessions use HttpOnly, Secure, SameSite=Lax cookies, a private session directory
  and a 30-day idle lifetime. Writes require an exact Origin and CSRF token.
- Google sign-in completion is checked against the server's receipt for the exact
  authorization attempt. Popup messages, periodic checks and returning to the game
  trigger that check. The app does not assume that window.closed means a mobile
  login was cancelled: Chrome can detach the opener while its tab remains open.
  The sign-in dialog offers Cancel sign-in and has a three-minute deadline with
  recovery instructions. Returning to the original game tab resumes a suspended
  completion check. A Google page that never finishes its own navigation still
  requires a real-device/network check; this mechanism cannot force Google to return.
- Offline reload can use a locally cached profile hint. It grants no server
  access. An expired session requires signing in again. Offline sign-out returns
  to guest and suppresses automatic account restoration; the server cookie cannot
  be revoked while unreachable and expires separately.
- Each save has a revision. Writes compare it atomically; conflicts trigger a
  fresh read/merge/retry up to five times. Payloads are limited to 750,000 bytes.
  A rejected/corrupt/oversized save never replaces local progress.
- Deletion requires a new Google authorization of the same account within five
  minutes, waits for pending local syncs, and deletes the DB account/save together.
  Other sessions lose access. The deleting device's account cache is removed;
  guest saves and backups or offline copies elsewhere are retained. Hosting
  backups follow the host's retention schedule.
- Hint balances are client-managed game state. This is not purchase verification
  or a server-authoritative economy. No paid purchase flow is added.
- The privacy notice describes Google identity, hosting storage and session cookies.
- Native Android accounts remain disabled. A future Android release needs a native
  Google identity flow and an explicit API authentication design; browser popup
  login must not be enabled inside a WebView.

## Development checks

```sh
npm test
npm run test:google-login
npm run build
npm run build:accounts
```

The Google library test verifies genuinely signed fictional JWTs and rejects wrong
signatures, audience, issuer, expiration and nonce without contacting Google.
For MySQL integration, run an **isolated test database**, never your real DB:

```sh
docker run --detach --rm --name nightcrossing-mysql-test --platform linux/amd64 \
  --publish 127.0.0.1:33316:3306 \
  --env MYSQL_ROOT_PASSWORD=nightcrossing-test-only \
  --env MYSQL_DATABASE=nightcrossing_test mysql:5.7.44
# Wait until MySQL reports ready, then:
npm run test:accounts-api
docker stop nightcrossing-mysql-test
```

The API suite drops/recreates only the loopback `nightcrossing_test` tables and
refuses other DB names/remote hosts. Its fictional Google provider lives in
`test/php/router.php`; it is never in public/ or the private package. Production
has no test-login bypass.

For manual local testing against your own Google test client, run a PHP server:

```sh
NC_PRIVATE_DIR="$PWD/server" php -S 127.0.0.1:8099 -t public
npm run dev
```

Use an ignored server/config.php with a local test DB, `development=true`, origin
matching Vite's printed URL (use 127.0.0.1 consistently), and the corresponding
localhost Google callback. Vite proxies /nightcrossing/api/ to the PHP server;
set the local private config's api_path to /nightcrossing/api/index.php. Vite
rewrites the prefix to the PHP server's public/api/index.php. Never deploy a test
router or development config.

Primary references: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[official PHP client](https://github.com/googleapis/google-api-php-client),
[cPanel Database Wizard](https://docs.cpanel.net/cpanel/databases/database-wizard/).

## Verification performed November 4, 2026

- 112 application tests passed, including historical-save preservation and the PHP
  adapter's conflict, offline, identity and popup checks.
- Five integration tests passed against an isolated MySQL 5.7.44 container: cookie/
  CSRF protections, OAuth state handling, owner isolation, revision conflicts,
  malformed saves, reauthentication and deletion/session invalidation.
- Signed JWT tests passed for the official Google verifier, including wrong
  signature, audience, issuer, expiry and nonce; the extracted release package
  passed these checks too. Composer reported no dependency advisories.
- An isolated headless Chrome session exercised the UI with a fictional Google
  provider and local PHP/MySQL: legacy import, actual letter entry, cross-browser
  restore, reload, sign-out and deletion passed without page errors.
- Production build, changed JavaScript lint, PHP syntax and whitespace checks
  passed. Local PHP was 8.5.6; Composer resolved dependencies for 8.4.0, and the
  added GitHub test workflow runs PHP 8.4. The live cPanel runtime and real Google
  consent flow still need the owner's setup and final verification.

Mobile login follow-up: 115 application tests and the production build passed.
Tests cover detached popups, focus/visibility recovery, matching authorization
receipts, cancellation and timeout cleanup. A mobile-emulated Chrome fixture used
a real COOP navigation that detached window.opener, then verified completion and
guest-save import without any popup message or automatic window closure. Real
Google sign-in on Android still needs the owner's final verification.
