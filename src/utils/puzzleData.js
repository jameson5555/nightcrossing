const normalizeBaseUrl = (url) => `${String(url || '').replace(/\/+$/, '')}/`;

const env = import.meta.env || {};
const bundledDataUrl = normalizeBaseUrl(`${env.BASE_URL || '/'}data`);
const remoteDataUrl = env.VITE_PUZZLE_DATA_URL
  ? normalizeBaseUrl(env.VITE_PUZZLE_DATA_URL)
  : null;

const dataUrls = [...new Set([remoteDataUrl, bundledDataUrl].filter(Boolean))];

const buildUrl = (baseUrl, path, fresh, version) => {
  const url = `${baseUrl}${String(path).replace(/^\/+/, '')}`;
  const params = [];
  if (version) params.push(`v=${encodeURIComponent(version)}`);
  if (fresh) params.push(`t=${Date.now()}`);
  return params.length ? `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}` : url;
};

export async function fetchPuzzleData(path, { fresh = true, version } = {}) {
  let lastError;

  for (const baseUrl of dataUrls) {
    try {
      const response = await fetch(buildUrl(baseUrl, path, fresh, version), {
        cache: fresh ? 'no-store' : 'default'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Failed to load puzzle data from ${baseUrl}`, error);
    }
  }

  throw lastError || new Error(`Unable to load puzzle data: ${path}`);
}
