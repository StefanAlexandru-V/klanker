"""
SearXNG web search client for klanker-voice.

Mirrors the web app's search.js — queries the local SearXNG
instance and returns formatted results for LLM context injection.
"""

import logging
import os

import httpx

log = logging.getLogger(__name__)

SEARCH_BASE = os.environ.get("KLANKER_SEARCH_URL", "http://localhost:8888/search")
MAX_SNIPPET_LENGTH = 300


async def web_search(query: str, limit: int = 5) -> list[dict]:
    """Search the web via SearXNG. Returns list of {title, url, content}."""
    params = {
        "q": query,
        "format": "json",
        "categories": "general",
        "language": "en",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(SEARCH_BASE, params=params)
        resp.raise_for_status()
        data = resp.json()

    seen = set()
    results = []

    for r in data.get("results", []):
        if not r.get("content") or not r.get("title") or not r.get("url"):
            continue

        domain = r["url"].replace("https://", "").replace("http://", "").split("/")[0]
        key = domain + "|" + r["title"].lower()[:60]
        if key in seen:
            continue
        seen.add(key)

        snippet = r["content"]
        if len(snippet) > MAX_SNIPPET_LENGTH:
            snippet = snippet[:MAX_SNIPPET_LENGTH] + "…"

        results.append({"title": r["title"], "url": r["url"], "content": snippet})
        if len(results) >= limit:
            break

    return results


def format_search_context(query: str, results: list[dict]) -> str:
    """Format search results into a compact context string for the LLM."""
    if not results:
        return f'Web search for "{query}" returned no results.'

    citations = "\n\n".join(
        f"[{i+1}] {r['title']} ({r['url']})\n{r['content']}"
        for i, r in enumerate(results)
    )

    return (
        f'Web search results for "{query}":\n\n'
        f"{citations}\n\n"
        "Respond to the user's question using these results. "
        "Cite with [n]. Do NOT list sources separately — weave citations naturally."
    )
