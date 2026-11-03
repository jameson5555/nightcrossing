export function getCloudConfig(env, native = false) {
  const enabled = env.VITE_CLOUD_SAVE_ENABLED === 'true' && !native;
  const firebase = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };
  return { enabled, firebase,
    configured: Object.values(firebase).every(value => typeof value === 'string' && value.trim()) };
}
