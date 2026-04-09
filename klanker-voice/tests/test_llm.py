"""Tests for the LLM streaming client."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.llm import stream_chat, chat_completion, StreamToken, SYSTEM_PROMPT


def _make_sse_chunk(content=None, reasoning=None):
    """Build an SSE data line from content/reasoning."""
    delta = {}
    if content:
        delta["content"] = content
    if reasoning:
        delta["reasoning_content"] = reasoning

    obj = {"choices": [{"delta": delta}]}
    return f"data: {json.dumps(obj)}\n\n"


def _make_sse_done():
    return "data: [DONE]\n\n"


class FakeAsyncIterator:
    """Simulates httpx async text streaming."""

    def __init__(self, chunks):
        self._chunks = iter(chunks)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._chunks)
        except StopIteration:
            raise StopAsyncIteration


class FakeStreamResponse:
    """Fake httpx streaming response context."""

    def __init__(self, chunks):
        self._chunks = chunks
        self.status_code = 200

    def raise_for_status(self):
        pass

    def aiter_text(self):
        return FakeAsyncIterator(self._chunks)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


class FakeClient:
    """Fake httpx.AsyncClient."""

    def __init__(self, chunks):
        self._chunks = chunks

    def stream(self, method, url, **kwargs):
        return FakeStreamResponse(self._chunks)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


@pytest.mark.asyncio
class TestStreamChat:
    async def test_yields_content_tokens(self):
        chunks = [
            _make_sse_chunk(content="Hello "),
            _make_sse_chunk(content="world"),
            _make_sse_done(),
        ]

        with patch("src.llm.httpx.AsyncClient", return_value=FakeClient(chunks)):
            tokens = []
            async for token in stream_chat("test-model", [{"role": "user", "content": "Hi"}]):
                tokens.append(token)

            assert len(tokens) == 2
            assert tokens[0] == StreamToken(type="content", text="Hello ")
            assert tokens[1] == StreamToken(type="content", text="world")

    async def test_yields_reasoning_tokens(self):
        chunks = [
            _make_sse_chunk(reasoning="Let me think..."),
            _make_sse_chunk(content="Answer"),
            _make_sse_done(),
        ]

        with patch("src.llm.httpx.AsyncClient", return_value=FakeClient(chunks)):
            tokens = []
            async for token in stream_chat("test-model", [{"role": "user", "content": "Hi"}]):
                tokens.append(token)

            assert tokens[0] == StreamToken(type="reasoning", text="Let me think...")
            assert tokens[1] == StreamToken(type="content", text="Answer")

    async def test_handles_split_chunks(self):
        sse_data = _make_sse_chunk(content="Hello") + _make_sse_chunk(content=" world") + _make_sse_done()
        mid = len(sse_data) // 2
        chunks = [sse_data[:mid], sse_data[mid:]]

        with patch("src.llm.httpx.AsyncClient", return_value=FakeClient(chunks)):
            tokens = []
            async for token in stream_chat("test-model", []):
                tokens.append(token)

            full = "".join(t.text for t in tokens)
            assert full == "Hello world"


@pytest.mark.asyncio
class TestChatCompletion:
    async def test_prepends_system_prompt(self):
        chunks = [_make_sse_chunk(content="response"), _make_sse_done()]
        captured_kwargs = {}

        class CapturingClient(FakeClient):
            def stream(self, method, url, **kwargs):
                captured_kwargs.update(kwargs)
                return super().stream(method, url, **kwargs)

        with patch("src.llm.httpx.AsyncClient", return_value=CapturingClient(chunks)):
            async for _ in chat_completion("model", [{"role": "user", "content": "Hi"}]):
                pass

            body = captured_kwargs["json"]
            assert body["messages"][0]["role"] == "system"
            assert "Klanker" in body["messages"][0]["content"]
            assert body["messages"][1]["role"] == "user"
            assert body["messages"][1]["content"] == "Hi"
