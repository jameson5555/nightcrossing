# Nightcrossing web analytics

The app sends the following events to the data layer used by the existing
Google Tag Manager container, `GTM-K2RBF57H`. Configure the forwarding tag below
to make them appear in the Nightcrossing Analytics property. Basic page-view
collection is already working; reuse that destination.

## Event definitions

| Event | When it fires |
| --- | --- |
| `level_start` | The first filled cell in a new puzzle, including a revealed letter. Opening an untouched puzzle without filling a cell does not count. |
| `puzzle_resume` | Opening an unfinished puzzle with saved letters or an earlier tracked start. Once per opening; typing afterward does not emit another start. |
| `level_end` | Solving an unfinished puzzle, with `success: true`. Opening an already-solved or rewarded puzzle does not count. |
| `sign_up` | A verified Google sign-in that actually creates a new Nightcrossing account, as confirmed by PHP/MySQL. |
| `login` | A verified Google sign-in to an existing Nightcrossing account. Restoring an existing session, syncing, cancelling sign-in, and confirming account deletion do not count. |

Puzzle events include `puzzle_id`, `level_name` (the same puzzle ID),
`puzzle_theme`, and `puzzle_difficulty`. Account events include `method: Google`.
The sender clears unused fields between events. Email, profile name, account
ID, Google subject, OAuth receipt, and entered puzzle answers are not sent in
these event payloads.

Tracking is disabled in the development server and Android builds. Your own
visits to the production website remain included; leave internal-traffic
filtering unchanged while verifying the setup.

## 1. Deploy the app and account backend

Deploy the updated web build through the existing web deployment workflow.
Account event classification also requires the updated private PHP backend:
replace `src/Api.php` and `src/Database.php` in the private
`nightcrossing-private/src/` directory outside `public_html`. The normal backend
release package includes both files. Preserve private `config.php` and
`runtime/`; this update needs no database migration.

The web workflow deploys the frontend but provides the private backend as a
separate artifact. See [account deployment](cloud-saves.md) for its installation.
An older backend continues to support gameplay and sign-in, but the frontend
will skip account analytics if the confirmed event type is absent.

## 2. Create the data layer variables in Tag Manager

Open [Google Tag Manager](https://tagmanager.google.com/) and select container
`GTM-K2RBF57H`.

Under **Variables → User-Defined Variables → New**, create the six variables
below. For each choose **Data Layer Variable**, keep **Data Layer Version 2**,
enter the exact data layer name, and save with the indicated variable name.
Leave default values unset.

| Variable name | Data Layer Variable Name |
| --- | --- |
| `NC - puzzle_id` | `puzzle_id` |
| `NC - level_name` | `level_name` |
| `NC - puzzle_theme` | `puzzle_theme` |
| `NC - puzzle_difficulty` | `puzzle_difficulty` |
| `NC - success` | `success` |
| `NC - method` | `method` |

Under **Variables → Built-In Variables → Configure**, enable **Event** if it is
not already available.

## 3. Create one trigger

Under **Triggers → New**, name it `NC - Gameplay and account events` and choose
**Custom Event**. Set the event name to the following exact expression:

```text
^(level_start|puzzle_resume|level_end|sign_up|login)$
```

Enable **Use regex matching**. Select **All Custom Events**, then save. The
anchored expression limits this trigger to these five events.

## 4. Create one Analytics event tag

Under **Tags → New**, name it `NC - GA4 gameplay and accounts`.

- **Tag type:** Google Analytics: GA4 Event.
- **Measurement ID:** copy the `G-…` Measurement ID from the Nightcrossing web
  stream in Analytics. This is different from the `GTM-…` container ID.
- **Event Name:** select the built-in **Event** variable, shown as `{{Event}}`.
- **Triggering:** select `NC - Gameplay and account events`.

Expand **Event Parameters** and add these six rows:

| Event parameter | Value (select the variable) |
| --- | --- |
| `puzzle_id` | `{{NC - puzzle_id}}` |
| `level_name` | `{{NC - level_name}}` |
| `puzzle_theme` | `{{NC - puzzle_theme}}` |
| `puzzle_difficulty` | `{{NC - puzzle_difficulty}}` |
| `success` | `{{NC - success}}` |
| `method` | `{{NC - method}}` |

Save. Keep the existing Google Analytics destination/Google tag that already
collects page views. This adds one event-forwarding tag; do not add another base
Google tag or another copy of the website snippet. If Google reports no Google
tag is found, verify this Measurement ID matches the existing destination first.

## 5. Preview, verify, then publish

Click **Preview** in Tag Manager, connect to
`https://jamesonmacarthur.com/nightcrossing/`, and perform real game actions:

1. Open an untouched puzzle. There should be no `level_start` until you fill a
   cell. Fill a cell and check for one `level_start` event in Tag Assistant.
2. Return to the menu and reopen the unfinished puzzle. Check for one
   `puzzle_resume`; continue typing and confirm there is no extra `level_start`.
3. Solve the puzzle. Check for one `level_end` with `success: true`. Reopening
   that completed puzzle should not produce another completion.
4. Sign out and sign back into an existing Nightcrossing account. Check for
   `login`, with `method: Google`. Reloading the signed-in app should not emit
   another login. `sign_up` requires a Google account that has never created a
   Nightcrossing account; do not delete an existing account just to test it.
5. For each event, select it in Tag Assistant. Confirm
   `NC - GA4 gameplay and accounts` fires once and its parameters match the
   puzzle or sign-in. Verify the event also reaches Analytics **DebugView** or
   **Realtime**. A data layer event by itself proves app emission, not delivery
   to Analytics.

After preview succeeds, use **Submit → Publish and Create Version**. Name the
version `Nightcrossing gameplay analytics`. Then check ordinary production
traffic in Analytics Realtime, outside preview.

If Tag Assistant sees the event but Analytics does not, check the event tag's
trigger, Measurement ID, unpublished container changes, and browser blockers.
Development-server testing does not emit these events. In a production preview,
this read-only browser console expression can show what the app has queued:

```js
window.dataLayer?.filter(item =>
  /^(level_start|puzzle_resume|level_end|sign_up|login)$/.test(item.event)
)
```

## 6. Enable reporting in Analytics

Once events arrive, go to **Admin → Data display → Events** and mark
`level_end` and `sign_up` as key events. Leave ordinary page views, starts,
resumes, and returning logins as regular events.

To compare themes and difficulty, use **Admin → Data display → Custom
definitions → Create custom dimension**. Create these with **Event** scope:

| Dimension name | Event parameter |
| --- | --- |
| Puzzle theme | `puzzle_theme` |
| Puzzle difficulty | `puzzle_difficulty` |
| Puzzle ID | `puzzle_id` |

These dimensions need to be registered for use in reports/explorations; seeing
the parameters in DebugView alone does not register them. Allow 24–48 hours for
custom dimensions to become available in standard reporting.

## Counting limits

Browser markers suppress repeated starts and completions per local profile and
puzzle across reloads. Saved letters and completion records also prevent old
games from looking like new starts/completions. Markers are local; they are not
added to cloud puzzle saves and are never sent to Analytics. Clearing site data,
switching browsers/devices, or switching between guest and account profiles can
produce separate histories. With storage blocked, deduplication lasts only for
the current page. Events are best effort, with no replay of historical gameplay.

## Google references

- [Data layer events](https://developers.google.com/tag-platform/tag-manager/datalayer)
- [GA4 event tags](https://support.google.com/tagmanager/answer/13034206?hl=en)
- [Custom event triggers](https://support.google.com/tagmanager/answer/7679219?hl=en)
- [Recommended event definitions](https://developers.google.com/analytics/devguides/collection/ga4/reference/events?hl=en)
- [Event-scoped custom dimensions](https://support.google.com/analytics/answer/14239696?hl=en)
