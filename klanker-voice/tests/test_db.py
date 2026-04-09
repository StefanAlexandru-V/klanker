"""Tests for the shared SQLite database layer."""

import sqlite3
import tempfile
from pathlib import Path

import pytest

from src.db import (
    get_connection,
    create_conversation,
    load_conversations,
    get_conversation,
    update_conversation,
    delete_conversation,
    add_message,
    update_message,
    load_messages,
)


@pytest.fixture
def db():
    """Create a fresh in-memory-like temp database for each test."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "test.db"
        conn = get_connection(path)
        yield conn
        conn.close()


class TestConversations:
    def test_create_conversation(self, db):
        conv = create_conversation(db, "Hello test")
        assert conv["id"].startswith("conv_")
        assert conv["title"] == "Hello test"
        assert conv["created_at"] > 0
        assert conv["messages"] == []

    def test_create_default_title(self, db):
        conv = create_conversation(db)
        assert conv["title"] == "New chat"

    def test_load_conversations_sorted_by_updated(self, db):
        c1 = create_conversation(db, "First")
        c2 = create_conversation(db, "Second")
        c3 = create_conversation(db, "Third")

        convs = load_conversations(db)
        assert len(convs) == 3
        assert convs[0]["title"] == "Third"
        assert convs[2]["title"] == "First"

    def test_get_conversation_with_messages(self, db):
        conv = create_conversation(db, "Test conv")
        add_message(db, conv["id"], "user", "Hello")
        add_message(db, conv["id"], "assistant", "Hi there")

        loaded = get_conversation(db, conv["id"])
        assert loaded is not None
        assert loaded["title"] == "Test conv"
        assert len(loaded["messages"]) == 2
        assert loaded["messages"][0]["role"] == "user"
        assert loaded["messages"][0]["content"] == "Hello"
        assert loaded["messages"][1]["role"] == "assistant"

    def test_get_nonexistent_conversation(self, db):
        assert get_conversation(db, "nope") is None

    def test_update_conversation_title(self, db):
        conv = create_conversation(db, "Old title")
        update_conversation(db, conv["id"], title="New title")

        loaded = get_conversation(db, conv["id"])
        assert loaded["title"] == "New title"

    def test_delete_conversation_cascades(self, db):
        conv = create_conversation(db, "To delete")
        add_message(db, conv["id"], "user", "Will be gone")

        delete_conversation(db, conv["id"])
        assert get_conversation(db, conv["id"]) is None
        assert load_messages(db, conv["id"]) == []


class TestMessages:
    def test_add_message_returns_id(self, db):
        conv = create_conversation(db, "Test")
        msg_id = add_message(db, conv["id"], "user", "Hello")
        assert isinstance(msg_id, int)
        assert msg_id > 0

    def test_messages_ordered_by_id(self, db):
        conv = create_conversation(db, "Test")
        add_message(db, conv["id"], "user", "First")
        add_message(db, conv["id"], "assistant", "Second")
        add_message(db, conv["id"], "user", "Third")

        msgs = load_messages(db, conv["id"])
        assert len(msgs) == 3
        assert msgs[0]["content"] == "First"
        assert msgs[1]["content"] == "Second"
        assert msgs[2]["content"] == "Third"

    def test_message_sources_as_json(self, db):
        conv = create_conversation(db, "Test")
        sources = [{"title": "Example", "url": "https://example.com", "content": "..."}]
        msg_id = add_message(db, conv["id"], "assistant", "Answer", sources=sources)

        msgs = load_messages(db, conv["id"])
        assert msgs[0]["sources"] == sources

    def test_update_message_content(self, db):
        conv = create_conversation(db, "Test")
        msg_id = add_message(db, conv["id"], "assistant", "")

        update_message(db, msg_id, content="Updated content")
        msgs = load_messages(db, conv["id"])
        assert msgs[0]["content"] == "Updated content"

    def test_update_message_sources(self, db):
        conv = create_conversation(db, "Test")
        msg_id = add_message(db, conv["id"], "assistant", "Answer")

        new_sources = [{"title": "New", "url": "https://new.com", "content": "new"}]
        update_message(db, msg_id, sources=new_sources)

        msgs = load_messages(db, conv["id"])
        assert msgs[0]["sources"] == new_sources

    def test_add_message_updates_conversation_timestamp(self, db):
        conv = create_conversation(db, "Test")
        original_ts = conv["updated_at"]

        add_message(db, conv["id"], "user", "Hello")
        loaded = get_conversation(db, conv["id"])
        assert loaded["updated_at"] >= original_ts

    def test_empty_files_and_images_default(self, db):
        conv = create_conversation(db, "Test")
        add_message(db, conv["id"], "user", "Hello")

        msgs = load_messages(db, conv["id"])
        assert msgs[0]["files"] == []
        assert msgs[0]["images"] == []

    def test_files_and_images_json(self, db):
        conv = create_conversation(db, "Test")
        files = [{"name": "test.pdf", "content": "...", "size": 1234}]
        images = [{"name": "img.png", "dataUrl": "data:image/png;base64,...", "size": 5678}]
        add_message(db, conv["id"], "user", "With attachments", files=files, images=images)

        msgs = load_messages(db, conv["id"])
        assert msgs[0]["files"] == files
        assert msgs[0]["images"] == images
