import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardedHints } from '../src/ads/rewardedHints.js';
import { createHintWallet } from '../src/utils/hintWallet.js';
import { getAdConfig } from '../src/ads/config.js';
import { createAndroidProvider } from '../src/ads/android.js';
import { createWebProvider } from '../src/ads/web.js';

const walletFixture = (legacy = 0) => {
  let stored;
  const io = { read: async () => stored, write: async value => { stored = structuredClone(value); }, readLegacy: async () => legacy };
  return { wallet: createHintWallet(io), restart: () => createHintWallet(io) };
};

test('wallet migrates, serializes simultaneous earnings/spends and persists receipts across restart', async () => {
  const { wallet, restart } = walletFixture(2);
  await Promise.all([wallet.change(1, 'ad:a'), wallet.change(5, 'puzzle:a'), wallet.change(-1), wallet.change(1, 'ad:a')]);
  assert.equal(await wallet.balance(), 7);
  assert.equal(await restart().change(1, 'ad:a'), 7);
  assert.equal(await wallet.change(-8), null);
  assert.equal(await wallet.balance(), 7);
});

test('reward credited exactly once even when provider repeats callback or show is double clicked', async () => {
  const { wallet } = walletFixture();
  let shown = 0;
  const ads = createRewardedHints({
    provider: { prepare: async () => ({ cancel() {}, show: async reward => { shown++; reward(); reward(); return 'completed'; } }) },
    credit: receipt => wallet.change(1, receipt),
  });
  await ads.prepare();
  assert.equal(ads.getState(), 'ready');
  assert.equal(await wallet.balance(), 0);
  await Promise.all([ads.show(), ads.show()]);
  assert.equal(shown, 1);
  assert.equal(await wallet.balance(), 1);
  assert.equal(ads.getState(), 'completed');
});

test('dismissal never credits a hint', async () => {
  let credits = 0;
  const ads = createRewardedHints({ provider: { prepare: async () => ({ cancel() {}, show: async () => 'dismissed' }) }, credit: async () => credits++ });
  await ads.prepare(); await ads.show();
  assert.equal(ads.getState(), 'dismissed');
  assert.equal(credits, 0);
});

test('closing hint window while loading discards late readiness and never auto-shows', async () => {
  let ready;
  let cancelled = 0;
  const ads = createRewardedHints({ provider: { prepare: () => new Promise(resolve => { ready = resolve; }) }, credit: async () => {} });
  const loading = ads.prepare();
  ads.cancel();
  ready({ cancel() { cancelled++; }, show() { assert.fail('Must not show'); } });
  await loading;
  assert.equal(ads.getState(), 'idle');
  assert.equal(cancelled, 1);
});

test('blocked provider times out without trapping gameplay and retries on next opening', async () => {
  let attempts = 0;
  const ads = createRewardedHints({ provider: { prepare: () => { attempts++; return new Promise(() => {}); } }, credit: async () => {}, timeoutMs: 5 });
  await ads.prepare();
  assert.equal(ads.getState(), 'unavailable');
  ads.cancel(); await ads.prepare();
  assert.equal(attempts, 2);
});

test('failed saving retries original reward without another ad', async () => {
  let saved = false;
  let shows = 0;
  const receipts = [];
  const ads = createRewardedHints({
    provider: { prepare: async () => ({ cancel() {}, show: async reward => { shows++; reward(); return 'completed'; } }) },
    credit: async receipt => { receipts.push(receipt); if (!saved) throw Error('Storage unavailable'); },
  });
  await ads.prepare(); await ads.show();
  assert.equal(ads.getState(), 'save-failed');
  saved = true;
  await ads.prepare();
  assert.equal(ads.getState(), 'completed');
  assert.equal(shows, 1);
  assert.equal(receipts[0], receipts[1]);
});

test('production needs explicit platform review; development cannot request live Android unit', () => {
  assert.equal(getAdConfig({}, 'android').enabled, false);
  assert.equal(getAdConfig({ VITE_ANDROID_REWARDED_ADS_ENABLED: 'true', VITE_ADS_TEST_MODE: 'false' }, 'android').enabled, false);
  const dev = getAdConfig({ DEV: true, VITE_ANDROID_REWARDED_ADS_ENABLED: 'true', VITE_ADS_TEST_MODE: 'false', VITE_ADMOB_REWARDED_UNIT_ID: 'live' }, 'android');
  assert.equal(dev.enabled, true);
  assert.equal(dev.test, true);
  assert.notEqual(dev.adUnitId, 'live');
  assert.equal(getAdConfig({ VITE_WEB_REWARDED_ADS_ENABLED: 'true', VITE_ADS_TEST_MODE: 'false', VITE_WEB_ADS_REVIEWED: 'true' }, 'web').enabled, false);
});

test('Android uses conservative non-child-directed ads without asserting player age', async () => {
  const calls = [];
  const callbacks = {};
  let removes = 0;
  const AdMob = {
    initialize: async options => calls.push(options),
    prepareRewardVideoAd: async options => calls.push(options),
    addListener: async (event, callback) => { callbacks[event] = callback; return { remove: async () => { removes++; } }; },
    showRewardVideoAd: async () => { callbacks.reward(); callbacks.dismiss(); return { amount: 1 }; },
  };
  const provider = createAndroidProvider({ enabled: true, test: true, adUnitId: 'test' }, async () => ({ AdMob, MaxAdContentRating: { General: 'General' }, RewardAdPluginEvents: { Rewarded: 'reward', Dismissed: 'dismiss', FailedToShow: 'failed' } }));
  const session = await provider.prepare(new AbortController().signal);
  assert.equal(calls[0].tagForChildDirectedTreatment, false);
  assert.equal(Object.hasOwn(calls[0], 'tagForUnderAgeOfConsent'), false);
  assert.equal(calls[0].maxAdContentRating, 'General');
  assert.equal(calls[1].npa, true);
  let rewards = 0;
  assert.equal(await session.show(() => rewards++), 'completed');
  assert.equal(rewards, 1);
  assert.equal(removes, 3);
});

test('disabled web ads inject no third-party script', async () => {
  const provider = createWebProvider({ enabled: false }, {}, { createElement() { assert.fail('Unexpected script'); } });
  assert.equal(await provider.prepare(new AbortController().signal), null);
});

test('web waits for explicit show and rewards only on adViewed', async () => {
  let script;
  let placement;
  let shown = 0;
  const win = { adsbygoogle: { push(options) { if (options.onReady) options.onReady(); else placement = options; } } };
  const doc = { createElement: () => ({ dataset: {} }), head: { appendChild: value => { script = value; } } };
  const provider = createWebProvider({ enabled: true, test: true, publisherId: 'ca-pub-1234567890123456' }, win, doc);
  const preparing = provider.prepare(new AbortController().signal);
  await Promise.resolve();
  placement.beforeReward(() => { shown++; });
  const session = await preparing;
  assert.equal(script.dataset.tagForChildDirectedTreatment, undefined);
  assert.equal(win.adsbygoogle.requestNonPersonalizedAds, 1);
  assert.equal(script.dataset.adbreakTest, 'on');
  assert.equal(shown, 0);
  let rewards = 0;
  const showing = session.show(() => rewards++);
  assert.equal(shown, 1);
  assert.equal(rewards, 0);
  placement.adViewed();
  placement.adBreakDone();
  assert.equal(await showing, 'completed');
  assert.equal(rewards, 1);
});
