/**
 * Nick's Kitchen — Meilisearch live-search client.
 *
 * Replaces the client-side substring filter with ranked, hybrid
 * (keyword + vector) search-as-you-type against a self-hosted Meilisearch
 * sidecar. Configured entirely through build-time env vars so no API key is
 * ever committed to the repo; when no endpoint is configured (or the sidecar
 * is unreachable), the caller silently falls back to the local substring
 * filter, so the static GitHub Pages site never depends on the backend.
 *
 * Build-time config (set in `.env`, a CI env, or `npm run build`):
 *   VITE_SEARCH_ENDPOINT   e.g. https://search.example.com          (required to enable)
 *   VITE_SEARCH_KEY        Meilisearch search-only key (never the master key)
 *   VITE_SEARCH_INDEX      default "recipes"
 *   VITE_SEARCH_HYBRID     "true" (default) to enable hybrid search
 */

const endpoint = (import.meta.env.VITE_SEARCH_ENDPOINT || '').trim();
const searchKey = (import.meta.env.VITE_SEARCH_KEY || '').trim();
const indexName = (import.meta.env.VITE_SEARCH_INDEX || 'recipes').trim();
const hybridEnabled = (import.meta.env.VITE_SEARCH_HYBRID || 'true').trim().toLowerCase() !== 'false';

export const searchConfig = {
  enabled: endpoint !== '',
  endpoint,
  index: indexName,
  hybrid: hybridEnabled,
};

/**
 * Live, ranked search over the configured Meilisearch index.
 *
 * @param {string} query      the trimmed free-text query ("" disables search)
 * @param {number} limit      max hits to fetch (default 24)
 * @returns {Promise<{hits: Array<{id:string}>, available: boolean}>}
 *   `available` is false when Meilisearch isn't configured, so callers can
 *   fall back to the local filter. Throws on a transport/HTTP error.
 */
export async function searchRecipes(query, limit = 24) {
  if (!searchConfig.enabled) return { hits: [], available: false };
  if (!query) return { hits: [], available: true };

  const body = {
    q: query,
    limit,
    attributesToRetrieve: ['id', 'title', 'description', 'categories'],
    showRankingScore: true,
  };
  if (hybridEnabled) body.hybrid = { embedder: 'default' };

  const res = await fetch(`${searchConfig.endpoint}/indexes/${encodeURIComponent(indexName)}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${searchKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Meilisearch search failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return { hits: data.hits || [], available: true };
}