"""
LM Studio streaming chat client with web search capability.

Mirrors the web app's streamChat() + search loop — sends
chat completions with SSE streaming, detects [SEARCH:] directives,
runs SearXNG, injects results, and re-prompts.
"""

import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass

import httpx

from .search import web_search, format_search_context

log = logging.getLogger(__name__)

API_BASE = os.environ.get("KLANKER_API_BASE", "http://10.3.58.20:1234/v1")

SYSTEM_PROMPT = """\
You are Klanker, a knowledgeable and helpful personal assistant.
You are responding through a voice-activated widget.
Keep answers concise — the user is speaking to you, not typing.
Match the user's language (English or Romanian).
If the user speaks Romanian, reply in Romanian.
Be direct and natural. No preamble, no flattery.

# Web search tool
You have access to a web search tool. To use it, output ONLY this exact format as your COMPLETE response:

[SEARCH: your search query]

CRITICAL rules for searching:
- The [SEARCH: ...] line must be your ENTIRE response. Nothing else.
- Do NOT include any thinking, reasoning, or explanation before or after it.
- Do NOT wrap it in markdown, code blocks, or any other formatting.
- The opening bracket [ and closing bracket ] are both REQUIRED.
- Keep queries short: 3-8 keywords.

When to search:
- Current events, recent news, live data, prices, weather, sports scores, software versions.
- When the user asks for links, resources, or recommendations you don't have from memory.
- When the user explicitly asks you to search the web.
- When you are not confident in your factual knowledge.

When NOT to search:
- Basic knowledge, coding, creative writing, math, or anything you are confident about.

After receiving search results:
- Answer the user's question using the search data.
- Cite sources naturally using [1], [2], etc.
- Limit citations to the most relevant 3-5 sources.
"""

SEARCH_PATTERN = re.compile(r"\[SEARCH:\s*(.+?)\]")
MAX_SEARCH_ROUNDS = 3


@dataclass
class StreamToken:
    type: str  # 'content', 'reasoning', or 'search'
    text: str


async def fetch_models() -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{API_BASE}/models")
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", [])


async def stream_chat(
    model_id: str,
    messages: list[dict],
) -> AsyncGenerator[StreamToken, None]:
    """Stream chat completions from LM Studio. Yields StreamToken objects."""
    payload = {
        "model": model_id,
        "messages": messages,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10)) as client:
        async with client.stream(
            "POST",
            f"{API_BASE}/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
        ) as resp:
            resp.raise_for_status()

            done = False
            buffer = ""
            async for chunk in resp.aiter_text():
                if done:
                    break
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()

                    if not line or not line.startswith("data: "):
                        continue

                    data_str = line[6:]
                    if data_str == "[DONE]":
                        done = True
                        break

                    try:
                        parsed = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    delta = parsed.get("choices", [{}])[0].get("delta", {})

                    if delta.get("reasoning_content"):
                        yield StreamToken(type="reasoning", text=delta["reasoning_content"])

                    if delta.get("content"):
                        yield StreamToken(type="content", text=delta["content"])


async def chat_completion(
    model_id: str,
    conversation_messages: list[dict],
    system_prompt: str | None = None,
    on_search=None,
) -> AsyncGenerator[StreamToken, None]:
    """
    High-level wrapper with search loop.

    If the model outputs [SEARCH: query], this:
    1. Emits a StreamToken(type='search', text=query)
    2. Runs SearXNG
    3. Injects results into context
    4. Re-prompts the model
    5. Streams the final response

    on_search(query) callback is called when a search starts.
    """
    base_system = system_prompt or SYSTEM_PROMPT

    api_messages = [
        {"role": "system", "content": base_system},
    ]
    for msg in conversation_messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    for search_round in range(MAX_SEARCH_ROUNDS + 1):
        full_text = ""
        async for token in stream_chat(model_id, api_messages):
            if token.type == "content":
                full_text += token.text

                # Buffer to detect [SEARCH:] before yielding
                trimmed = full_text.strip()
                search_idx = trimmed.rfind("[SEARCH:")
                if search_idx != -1:
                    after = trimmed[search_idx:]
                    if not after.endswith("]"):
                        continue  # still buffering

                yield token
            else:
                yield token

        # Check if the response is a search directive
        match = SEARCH_PATTERN.search(full_text.strip())
        if not match or search_round >= MAX_SEARCH_ROUNDS:
            break

        search_query = match.group(1).strip()
        log.info("Search directive detected: '%s' (round %d)", search_query, search_round + 1)

        yield StreamToken(type="search", text=search_query)

        if on_search:
            on_search(search_query)

        # Run the search
        try:
            results = await web_search(search_query)
            search_context = format_search_context(search_query, results)
            log.info("Search returned %d results", len(results))
        except Exception as e:
            log.error("Search failed: %s", e)
            search_context = f'Web search for "{search_query}" failed.'

        # Rebuild messages with search context injected into system prompt
        api_messages = [
            {"role": "system", "content": f"{base_system}\n\n{search_context}"},
        ]
        for msg in conversation_messages:
            api_messages.append({"role": msg["role"], "content": msg["content"]})

        # Clear previous partial output — next stream is the real response
        full_text = ""
