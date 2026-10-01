# Monetization and Google Play launch

## Current implementation

One optional ad earns one banked hint, offered only when the balance is zero and the current puzzle's free hint is used. No ads interrupt play automatically. Existing completion and timed rewards remain available. Spending an ad-funded hint preserves an already running bonus timer.

Android uses Capacitor AdMob; web uses AdSense H5 Games Ads. Both are disabled by default. Unavailable ads do not block play. Reward confirmations are deduplicated in a serialized local wallet; no account or server-side reward verification is introduced. Balance changes are serialized within one running app; separate browser tabs are not transactionally coordinated and devices do not share a wallet, and local data remains user-editable. A failed local reward save can be retried in the hint window without watching again; do not reload before retrying.

## Audience and access

Position Nightcrossing for adult crossword players. In Play Console select **18 and over** as the intended audience and leave **Restrict Minor Access** unchecked. Do not add a birth-date prompt, age screen, identity check, or account requirement. Use evening relaxation and crossword solving in the store listing; do not market it as a children's learning game or as designed for all ages.

The target audience describes the game's design and marketing; it does not establish each player's age or determine the IARC content rating. The selected audience must remain accurate. Review any future evidence that the service is child-directed or knowingly collects personal information from children before serving those users ads.

## PWA first: account and test setup

The owner has an existing AdSense account, has added `jamesonmacarthur.com`, and supplied publisher ID `pub-6539140496743179`. The script uses `ca-pub-6539140496743179`. Site approval and H5 access have not yet been confirmed. Google Play and AdMob setup can wait until after PWA testing.

Google provides a separate [H5 Games Ads application](https://adsense.google.com/start/h5-game-ads-apply/). Receiving the standard AdSense installation code does not establish H5 approval. Use the existing AdSense account, the publisher ID above, and game URL `https://jamesonmacarthur.com/nightcrossing/`. The form asks for the email associated with the AdSense account when available; the public support address can remain `nightcrossing@jamesonmacarthur.com`.

Local `.env.local` is configured for web test ads, with live review flags false and Android ads disabled. This file is ignored by Git and is not deployed. Restart `npm run dev` after changing environment settings. Exhaust banked hints and use the puzzle's free hint, then open an unsolved word's hint window while online. Google test ads should be explicitly labeled; verify completion adds one hint and early dismissal adds none. Local configuration and mocked tests do not establish that Google's SDK or the publisher account works end to end.

To configure a deployed test build later, set these GitHub Actions repository variables before rebuilding:

```text
NC_WEB_REWARDED_ADS_ENABLED=true
NC_ADS_TEST_MODE=true
NC_H5_PUBLISHER_ID=ca-pub-6539140496743179
NC_WEB_ADS_REVIEWED=false
NC_WEB_US_AD_SERVING_VERIFIED=false
```

Both web workflows already read these variables. These repository settings have not been changed as part of local setup. Test ads do not generate revenue. Leave live ads disabled until H5/site approval and the applicable web launch checks below are complete. Do not add a second generic AdSense script to the game: the rewarded provider loads its script with test settings when needed. Site verification at the domain root is a separate hosting step; the lazy game script may not satisfy the site's verification check.

## Before enabling live ads

1. Create a personal Google Play Console account, pay its one-time registration fee, and complete identity and device verification. Create AdMob and apply separately for AdSense H5 Games Ads. Account, payment, identity and publisher approval steps must be completed by the owner.
2. Set the adult audience and unrestricted access options described above, and complete the content-rating questionnaire based on actual game content. No mixed-audience Families launch is planned.
3. Verify the pinned Google Mobile Ads SDK 24.9.0 and installed Capacitor bridge against current publisher requirements. Test the exact SDK before live activation. Do not add unreviewed mediation networks.
4. Keep non-personalized advertising and conservative publisher category blocks. Android requests use a general-audience maximum ad-content rating; the manifest removes AD_ID permission. The app is tagged as not child-directed, but individual age-of-consent treatment is unspecified. Web requests explicitly disable personalization and do not tag the service as child-directed. Verify actual ad requests and the merged Android manifest.
5. Verify rewarded ads are clearly optional, explain the one-hint reward, and have working provider dismissal controls. Closing early does not itself earn a hint. Do not promise a fixed ad duration; the provider determines the completion requirement. The Families-specific five-second condition is not a launch requirement for the selected non-child-directed audience.
6. For web, obtain provider confirmation/configuration that enforces the US-only launch. A build flag records completion of this check; it does not implement geolocation. No client-side timezone or language heuristic is used. If H5 cannot enforce the geographic restriction, leave web ads disabled rather than silently serving worldwide.
7. Review hosting logs/retention, Google data collection and applicable privacy controls. Adult audience positioning and non-personalized ads do not establish a player's age or consent, nor remove regional privacy obligations. Implement required consent/privacy controls before activating ads; do not mark a platform reviewed while these remain unresolved. Confirm the Android serving scope as well as US Play distribution, since store availability does not prove a device's current location.
8. Use **nightcrossing@jamesonmacarthur.com** for public support and privacy inquiries. Finalize the public privacy notice with verified hosting/ad-provider practices. The current notice is a starting point, not a completed store declaration. Check ongoing generated puzzle content against the actual content rating.
9. Copy the real authorization lines from AdMob/AdSense to `https://jamesonmacarthur.com/app-ads.txt` and `https://jamesonmacarthur.com/ads.txt`, preserving any existing publishers. These files belong at the host root, outside this project's `/nightcrossing/` deployment. Do not publish made-up publisher IDs. Verify discovery in the consoles.

## Configuration

Copy `.env.example` to `.env.local` for local work. Development always forces test mode, even when `VITE_ADS_TEST_MODE=false`. An enabled Android test build uses Google's rewarded test unit; web test mode still needs an H5 publisher ID.

| Setting | Meaning |
| --- | --- |
| `VITE_ANDROID_REWARDED_ADS_ENABLED` | Android ad integration switch |
| `VITE_WEB_REWARDED_ADS_ENABLED` | Web ad integration switch |
| `VITE_ADS_TEST_MODE` | Defaults to true; set false only for approved live serving |
| `VITE_ADMOB_REWARDED_UNIT_ID` | Live Android rewarded unit ID |
| `VITE_H5_PUBLISHER_ID` | Web `ca-pub-…` publisher ID |
| `VITE_ANDROID_ADS_REVIEWED` | Records completion of Android launch checks |
| `VITE_WEB_ADS_REVIEWED` | Records completion of web launch checks |
| `VITE_WEB_US_AD_SERVING_VERIFIED` | Records verified provider-side US restriction |
| `NC_ADMOB_APP_ID` | Native build-time AdMob app ID; distinct from the rewarded unit ID |

Never put private signing credentials in `VITE_` variables: these are shipped to players. Defaults use Google's sample native app ID so ad-disabled builds can start safely with the installed SDK.

CI uses repository variables named `NC_…` corresponding to the ad settings above. For example, `NC_WEB_REWARDED_ADS_ENABLED` maps to `VITE_WEB_REWARDED_ADS_ENABLED`. Both web deploy workflows must use the same values so monthly puzzle deployment does not overwrite monetization configuration. Switch a platform off and rebuild/redeploy to roll back; installed Android versions require an update or an AdMob-side serving stop.

## Android bundle and signing

The workflow supports manual debug APKs or signed release AABs. It uses Node 22, Java 21 and Android SDK 36. Keep Play App Signing enabled and keep a backed-up upload key outside the repository.

Set these GitHub Actions secrets:

- `NC_ANDROID_KEYSTORE_BASE64`: base64-encoded upload keystore.
- `NC_ANDROID_KEYSTORE_PASSWORD`
- `NC_ANDROID_KEY_ALIAS`
- `NC_ANDROID_KEY_PASSWORD`

Run **Build Android App** with `release_bundle=true`, an increasing `version_code`, and a user-facing `version_name`. A GitHub release also requests a signed bundle, defaulting its version code to the workflow run number; verify that number exceeds the last uploaded code. The job uploads the AAB as a workflow artifact; it does not submit or publish to Google Play. Missing signing secrets fail the release build explicitly.

For local release builds, set `NC_ANDROID_KEYSTORE_PATH` to the private keystore location plus the three password/alias variables above, run `NC_BUILD_TARGET=android npm run build` (relative bundled asset paths), run `npx cap sync android`, and run `./gradlew bundleRelease` in `android/`. This workstation currently lacks the Android SDK, so native builds and physical-device QA remain outstanding.

## Closed test and store submission

Use the copy in `store-listing.md`. Supply actual phone screenshots, a 512×512 store icon and 1024×500 feature graphic, **nightcrossing@jamesonmacarthur.com** as the public support email, and the deployed privacy URL. Review all assets before upload. Complete the target audience, IARC rating, ads, app access, and Data safety forms based on the actual release SDKs and settings. Do not select “no data collected” simply because gameplay progress is local.

Start with internal testing, then recruit 15–20 Android users so at least 12 remain opted in continuously for 14 days. Daily play is not an explicit enrollment requirement, but meaningful engagement and feedback are required. Ask testers to solve puzzles, use free and rewarded hints, dismiss ads, try offline play, restart, and report problems. Keep a feedback log including device, app version, steps, result and resolution; avoid collecting unnecessary personal data. Apply for production access with an accurate testing summary, then launch to the US after approval.

## Acceptance checks

- Run `npm test`, `npm run build`, and lint. Track existing repository lint failures separately; changed application code must pass.
- Test exactly one hint for a confirmed reward; none for dismissal, load failure, or duplicate callbacks. Retry failed local storage without another ad. Verify balance after restarting.
- Open/close the hint window during loading, reopen, double-click watch, and background/resume during an ad. Ads never show from a late callback after closing the offer.
- Receive a timed or completion reward during the ad; preserve both credits. Spend an ad hint and verify the previous free bonus deadline remains intact.
- Test Android on a physical device and web in mobile browser and installed mode, with offline and ad-blocked cases. Check small screens and keyboard focus.
- Confirm non-personalized requests, conservative ad content, no merged AD_ID permission, verified serving geography, and working dismissal controls. Verify no age gate or optional minor-access restriction was introduced. Test ads do not prove live creative compliance.
- Review revenue, impressions, reward outcomes, crashes and tester feedback weekly for the first month. Separate Android and web results. Do not increase ad pressure to compensate for low traffic.

## Primary references

- [Google Play account setup](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)
- [Closed testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play target audiences and optional minor-access restriction](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en)
- [Android ad targeting](https://developers.google.com/admob/android/targeting)
- [H5 configuration](https://support.google.com/adsense/answer/9955214?hl=en)
- [AdSense non-personalized ad requests](https://support.google.com/adsense/answer/7670312?hl=en)
- [Rewarded H5 callbacks](https://developers.google.com/ad-placement/apis)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
