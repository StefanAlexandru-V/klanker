/**
 * SearXNG search client.
 * Queries the local SearXNG instance and returns formatted results.
 * @module search
 */

const SEARCH_BASE = '/search';
const MAX_SNIPPET_LENGTH = 300;

/**
 * @typedef {object} SearchResult
 * @property {string} title
 * @property {string} url
 * @property {string} content
 */

/**
 * Searches the web via SearXNG.
 * Deduplicates by URL and limits results.
 * @param {string} query
 * @param {number} [limit=5]
 * @returns {Promise<SearchResult[]>}
 */
export async function webSearch(query, limit = 5) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    categories: 'general',
    language: 'en',
  });

  const res = await fetch(`${SEARCH_BASE}?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);

  const data = await res.json();

  const seen = new Set();
  const results = [];

  for (const r of data.results || []) {
    if (!r.content || !r.title || !r.url) continue;

    const domain = r.url.replace(/^https?:\/\//, '').split('/')[0];
    const key = domain + '|' + r.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);

    const snippet = r.content.length > MAX_SNIPPET_LENGTH
      ? r.content.slice(0, MAX_SNIPPET_LENGTH) + '…'
      : r.content;

    results.push({ title: r.title, url: r.url, content: snippet });
    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Formats search results into a compact context string for the LLM.
 * @param {string} query
 * @param {SearchResult[]} results
 * @returns {string}
 */
export function formatSearchContext(query, results) {
  if (results.length === 0) {
    return `Web search for "${query}" returned no results.`;
  }

  const citations = results
    .map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.content}`)
    .join('\n\n');

  return `Web search results for "${query}":\n\n${citations}\n\nRespond to the user's question using these results. Cite with [n]. Do NOT list the sources separately — weave citations naturally into your answer.`;
}
