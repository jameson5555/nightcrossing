export function getCloudConfig(env, native = false) {
  const enabled = env.VITE_CLOUD_SAVE_ENABLED === 'true' && !native;
  const endpoint = env.VITE_ACCOUNTS_API_PATH || '/nightcrossing/api/index.php';
  return { enabled, backend: { endpoint },
    configured: /^\/[a-zA-Z0-9/_-]+\.php$/.test(endpoint) };
}
