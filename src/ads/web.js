export function createWebProvider(config, win = window, doc = document) {
  let initialized;
  const initialize = () => {
    initialized ||= new Promise((resolve, reject) => {
      win.adsbygoogle ||= [];
      win.adsbygoogle.requestNonPersonalizedAds = 1;
      // No automatic placements: only a reward placement is ever requested.
      const script = doc.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.publisherId)}`;
      script.dataset.adClient = config.publisherId;
      if (config.test) script.dataset.adbreakTest = 'on';
      script.onerror = () => reject(new Error('Ads unavailable'));
      win.adsbygoogle.push({ sound: 'off', onReady: resolve });
      doc.head.appendChild(script);
    });
    return initialized;
  };
  return {
    async prepare(signal) {
      if (!config.enabled || !/^ca-pub-\d{16}$/.test(config.publisherId || '') || signal.aborted) return null;
      await initialize();
      if (signal.aborted) return null;
      return new Promise(resolve => {
        let active = true;
        let complete;
        let grant;
        let outcome = 'unavailable';
        let watchdog;
        const cancel = () => {
          active = false;
          clearTimeout(watchdog);
          signal.removeEventListener('abort', cancel);
          resolve(null);
        };
        signal.addEventListener('abort', cancel, { once: true });
        win.adsbygoogle.push({
          type: 'reward', name: 'bonus_hint',
          beforeReward: showAd => {
            if (!active) return;
            resolve({
              cancel,
              show: onReward => new Promise((done, reject) => {
                if (!active) { done('unavailable'); return; }
                grant = onReward;
                complete = done;
                outcome = 'dismissed';
                watchdog = setTimeout(() => { done('failed'); cancel(); }, 180000);
                try { showAd(); } catch (error) { reject(error); }
              }),
            });
          },
          adViewed: () => { if (active && grant) { outcome = 'completed'; grant(); } },
          adDismissed: () => { if (outcome !== 'completed') outcome = 'dismissed'; },
          adBreakDone: () => { complete?.(outcome); cancel(); resolve(null); },
        });
      });
    },
  };
}
