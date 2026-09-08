/**
 * Nick's Kitchen — recipes search client (WILS-4).
 *
 * Talks to the Cloudflare Worker search service (search/worker), which fronts
 * hosted Meilisearch. The Worker holds the Meilisearch API key; the browser
 * only ever sees the Worker URL, so no key ships in the static build.
 *
 * Configured entirely through build-time env vars. When no endpoint is
 * configured (or the service is unreachable), the caller silently falls back
 * to the local substring filter, so the static site never depends on it.
 *
 * Build-time config (set in `.env`, a CI env, or `npm run build`):
 *   VITE_SEARCH_ENDPOINT   Worker base URL, e.g. https://recipes-search.xxx.workers.dev
 *                          (required to enable)
 *   VITE_SEARCH_INDEX      index name (default "recipes"; informational — the
 *                          Worker pins its own index)
 *   VITE_SEARCH_HYBRID     "true" (default) to request hybrid search; the
 *                          Worker degrades to keyword-only if embeddings fail
 */

const endpoint = (import.meta.env.VITE_SEARCH_ENDPOINT || '').trim();
const hybridEnabled = (import.meta.env.VITE_SEARCH_HYBRID || 'true').trim().toLowerCase() !== 'false';

export const searchConfig = {
  enabled: endpoint !== '',
  endpoint,
  hybrid: hybridEnabled,
};

/**
 * Live, ranked search over the search service.
 *
 * @param {string} query      the trimmed free-text query ("" disables search)
 * @param {object} [opts]     { limit, categories, maxMinutes }
 * @returns {Promise<{hits: Array<{id:string}>, available: boolean}>}
 *   `available` is false when the service isn't configured, so callers can
 *   fall back to the local filter. Throws on a transport/HTTP error.
 */
export async function searchRecipes(query, limit = 24, opts = {}) {
  if (!searchConfig.enabled) return { hits: [], available: false };
  if (!query) return { hits: [], available: true };

  const body = {
    q: query,
    limit,
    hybrid: searchConfig.hybrid,
  };
  if (Array.isArray(opts.categories) && opts.categories.length) body.categories = opts.categories;
  if (opts.maxMinutes) body.maxMinutes = opts.maxMinutes;

  const res = await fetch(`${searchConfig.endpoint}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Search service failed (${res.status})`);
  }

  const data = await res.json();
  return { hits: data.hits || [], available: true, degraded: data.degraded === true };
}