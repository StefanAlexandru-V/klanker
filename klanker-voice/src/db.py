"""
Shared SQLite conversation storage.

Schema mirrors the web app's IndexedDB structure so both
the Klanker web UI and voice widget read/write the same data.

The database file lives at:
  - Windows: %APPDATA%/klanker/conversations.db
  - Linux/WSL: ~/.local/share/klanker/conversations.db
"""

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path


def _db_path() -> Path:
    """Resolve the shared database file path."""
    env = os.environ.get("KLANKER_DB_PATH")
    if env:
        return Path(env)

    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))

    return base / "klanker" / "conversations.db"


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    """Open a connection to the shared database, creating it if needed."""
    path = db_path or _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'New chat',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content         TEXT NOT NULL DEFAULT '',
            reasoning       TEXT DEFAULT '',
            sources         TEXT DEFAULT '[]',
            search_query    TEXT DEFAULT '',
            files           TEXT DEFAULT '[]',
            images          TEXT DEFAULT '[]',
            created_at      REAL NOT NULL,
            UNIQUE(id, conversation_id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conv
            ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_updated
            ON conversations(updated_at DESC);
    """)


def _now() -> float:
    return time.time() * 1000  # milliseconds, matching JS Date.now()


def _new_id() -> str:
    return f"conv_{uuid.uuid4().hex[:8]}_{int(_now())}"


# ---------------------------------------------------------------------------
# Conversation CRUD
# ---------------------------------------------------------------------------

def create_conversation(conn: sqlite3.Connection, title: str = "New chat") -> dict:
    now = _now()
    conv_id = _new_id()
    conn.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (conv_id, title, now, now),
    )
    conn.commit()
    return {"id": conv_id, "title": title, "created_at": now, "updated_at": now, "messages": []}


def load_conversations(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_conversation(conn: sqlite3.Connection, conv_id: str) -> dict | None:
    row = conn.execute(
        "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
        (conv_id,),
    ).fetchone()
    if not row:
        return None
    conv = dict(row)
    conv["messages"] = load_messages(conn, conv_id)
    return conv


def update_conversation(conn: sqlite3.Connection, conv_id: str, **kwargs) -> None:
    allowed = {"title", "updated_at"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    fields.setdefault("updated_at", _now())
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(
        f"UPDATE conversations SET {sets} WHERE id = ?",
        (*fields.values(), conv_id),
    )
    conn.commit()


def delete_conversation(conn: sqlite3.Connection, conv_id: str) -> None:
    conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()


# ---------------------------------------------------------------------------
# Message CRUD
# ---------------------------------------------------------------------------

def add_message(
    conn: sqlite3.Connection,
    conv_id: str,
    role: str,
    content: str = "",
    reasoning: str = "",
    sources: list | None = None,
    search_query: str = "",
    files: list | None = None,
    images: list | None = None,
) -> int:
    now = _now()
    cur = conn.execute(
        """INSERT INTO messages
           (conversation_id, role, content, reasoning, sources, search_query, files, images, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            conv_id,
            role,
            content,
            reasoning,
            json.dumps(sources or []),
            search_query,
            json.dumps(files or []),
            json.dumps(images or []),
            now,
        ),
    )
    conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
    conn.commit()
    return cur.lastrowid


def update_message(conn: sqlite3.Connection, msg_id: int, **kwargs) -> None:
    allowed = {"content", "reasoning", "sources", "search_query", "files", "images"}
    fields = {}
    for k, v in kwargs.items():
        if k not in allowed:
            continue
        if k in ("sources", "files", "images") and isinstance(v, list):
            fields[k] = json.dumps(v)
        else:
            fields[k] = v
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE messages SET {sets} WHERE id = ?", (*fields.values(), msg_id))
    conn.commit()


def load_messages(conn: sqlite3.Connection, conv_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC",
        (conv_id,),
    ).fetchall()
    result = []
    for r in rows:
        m = dict(r)
        for field in ("sources", "files", "images"):
            try:
                m[field] = json.loads(m[field]) if m[field] else []
            except (json.JSONDecodeError, TypeError):
                m[field] = []
        result.append(m)
    return result
