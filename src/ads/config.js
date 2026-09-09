export function getAdConfig(env, platform) {
  const test = env.DEV || env.VITE_ADS_TEST_MODE !== 'false';
  const enabled = platform === 'android'
    ? env.VITE_ANDROID_REWARDED_ADS_ENABLED === 'true'
    : platform === 'web' && env.VITE_WEB_REWARDED_ADS_ENABLED === 'true';
  const reviewed = platform === 'android'
    ? env.VITE_ANDROID_ADS_REVIEWED === 'true'
    : env.VITE_WEB_ADS_REVIEWED === 'true' && env.VITE_WEB_US_AD_SERVING_VERIFIED === 'true';
  return {
    enabled: enabled && (test || reviewed),
    test,
    adUnitId: test ? 'ca-app-pub-3940256099942544/5224354917' : env.VITE_ADMOB_REWARDED_UNIT_ID,
    publisherId: env.VITE_H5_PUBLISHER_ID,
  };
}
