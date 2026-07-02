const normalizeBaseUrl = (url) => `${String(url || '').replace(/\/+$/, '')}/`;

const bundledDataUrl = normalizeBaseUrl(`${import.meta.env.BASE_URL}data`);
const remoteDataUrl = import.meta.env.VITE_PUZZLE_DATA_URL
  ? normalizeBaseUrl(import.meta.env.VITE_PUZZLE_DATA_URL)
  : null;

const dataUrls = [...new Set([remoteDataUrl, bundledDataUrl].filter(Boolean))];

const buildUrl = (baseUrl, path, fresh) => {
  const url = `${baseUrl}${String(path).replace(/^\/+/, '')}`;
  if (!fresh) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
};

export async function fetchPuzzleData(path, { fresh = true } = {}) {
  let lastError;

  for (const baseUrl of dataUrls) {
    try {
      const response = await fetch(buildUrl(baseUrl, path, fresh), {
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

