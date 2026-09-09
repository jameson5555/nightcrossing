export function createAndroidProvider(config, loadSDK = () => import('@capacitor-community/admob')) {
  let initializing;
  return {
    async prepare(signal) {
      if (!config.enabled || signal.aborted || !config.adUnitId) return null;
      const { AdMob, MaxAdContentRating, RewardAdPluginEvents: events } = await loadSDK();
      if (signal.aborted) return null;
      initializing ||= AdMob.initialize({
        initializeForTesting: config.test,
        // The game is marketed to adults; this does not verify a player's age.
        // Leave individual age-of-consent treatment unspecified.
        tagForChildDirectedTreatment: false,
        maxAdContentRating: MaxAdContentRating.General,
      }).catch(error => { initializing = undefined; throw error; });
      await initializing;
      if (signal.aborted) return null;
      await AdMob.prepareRewardVideoAd({ adId: config.adUnitId, isTesting: config.test, npa: true });
      if (signal.aborted) return null;
      const handles = [];
      const cancel = () => { handles.splice(0).forEach(handle => { void handle.remove().catch(() => {}); }); };
      return {
        cancel,
        async show(onReward) {
          return new Promise((resolve, reject) => {
            let rewarded = false;
            let finished = false;
            const watchdog = setTimeout(() => finish('failed'), 180000);
            const finish = outcome => {
              if (finished) return;
              finished = true;
              clearTimeout(watchdog);
              cancel();
              resolve(outcome);
            };
            const register = async () => {
              handles.push(await AdMob.addListener(events.Rewarded, () => { if (!finished) { rewarded = true; onReward(); } }));
              handles.push(await AdMob.addListener(events.Dismissed, () => finish(rewarded ? 'completed' : 'dismissed')));
              handles.push(await AdMob.addListener(events.FailedToShow, () => finish('failed')));
              // The returned promise also contains reward data. Use only the
              // Rewarded event, so a single viewing can never grant twice.
              AdMob.showRewardVideoAd().catch(() => finish('failed'));
            };
            register().catch(error => { clearTimeout(watchdog); finished = true; cancel(); reject(error); });
          });
        },
      };
    },
  };
}
