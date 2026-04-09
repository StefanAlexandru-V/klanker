/**
 * Tiny HTTP API server backed by the shared SQLite database.
 * The Vite dev server proxies /api/* to this.
 *
 * Endpoints:
 *   GET    /api/conversations              — list all (sorted by updated_at desc)
 *   GET    /api/conversations/:id          — get one with messages
 *   POST   /api/conversations              — create { title }
 *   PUT    /api/conversations/:id          — update { title }
 *   DELETE /api/conversations/:id          — delete
 *   GET    /api/conversations/:id/messages — list messages
 *   POST   /api/conversations/:id/messages — add { role, content, reasoning, sources, ... }
 *   PUT    /api/messages/:id               — update message fields
 *   GET    /api/tools                      — list available tools
 *   POST   /api/tools/execute              — execute a tool
 *
 * @module api-server
 */

import { createServer } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { listTools, executeTool } from './tools/registry.js';

const PORT = parseInt(process.env.KLANKER_API_PORT || '3100', 10);

function getDbPath() {
  if (process.env.KLANKER_DB_PATH) return process.env.KLANKER_DB_PATH;

  const base = process.platform === 'win32'
    ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    : process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');

  const dir = join(base, 'klanker');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'conversations.db');
}

function initDb() {
  const dbPath = getDbPath();
  console.log(`[api-server] SQLite: ${dbPath}`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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
      created_at      REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
  `);

  // Migration: add tool_calls column if missing
  const cols = db.pragma('table_info(messages)').map((c) => c.name);
  if (!cols.includes('tool_calls')) {
    db.exec(`ALTER TABLE messages ADD COLUMN tool_calls TEXT DEFAULT '[]'`);
  }

  return db;
}

const db = initDb();

const now = () => Date.now();
let _convCounter = 0;
const newConvId = () => `conv_${++_convCounter}_${now()}`;

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function parseJsonField(val) {
  if (!val) return [];
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return val;
}

function formatMessage(row) {
  return {
    ...row,
    sources: parseJsonField(row.sources),
    files: parseJsonField(row.files),
    images: parseJsonField(row.images),
    tool_calls: parseJsonField(row.tool_calls),
  };
}

const stmts = {
  listConvs: db.prepare('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC'),
  getConv: db.prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?'),
  insertConv: db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'),
  upsertConv: db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
  `),
  updateConv: db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'),
  deleteConv: db.prepare('DELETE FROM conversations WHERE id = ?'),
  listMsgs: db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC'),
  insertMsg: db.prepare(`
    INSERT INTO messages (conversation_id, role, content, reasoning, sources, search_query, files, images, tool_calls, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateMsg: db.prepare('UPDATE messages SET content = ?, reasoning = ?, sources = ?, search_query = ?, tool_calls = ? WHERE id = ?'),
  touchConv: db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?'),
};

async function handleRequest(req, res) {
  const { method } = req;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // Tool endpoints
    if (path.startsWith('/api/tools')) {
      const handled = await handleToolRequest(req, res, method, path);
      if (handled !== false) return;
    }

    // GET /api/conversations
    if (method === 'GET' && path === '/api/conversations') {
      const convs = stmts.listConvs.all();
      return json(res, convs);
    }

    // POST /api/conversations
    if (method === 'POST' && path === '/api/conversations') {
      const body = await parseBody(req);
      const id = body.id || newConvId();
      const ts = now();
      const title = body.title || 'New chat';
      stmts.insertConv.run(id, title, ts, ts);
      return json(res, { id, title, created_at: ts, updated_at: ts, messages: [] }, 201);
    }

    // Routes with :id
    const convMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
    const msgListMatch = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    const msgUpdateMatch = path.match(/^\/api\/messages\/(\d+)$/);

    // GET /api/conversations/:id
    if (method === 'GET' && convMatch) {
      const conv = stmts.getConv.get(convMatch[1]);
      if (!conv) return json(res, { error: 'Not found' }, 404);
      const messages = stmts.listMsgs.all(conv.id).map(formatMessage);
      return json(res, { ...conv, messages });
    }

    // PUT /api/conversations/:id (upsert — creates if missing)
    if (method === 'PUT' && convMatch) {
      const body = await parseBody(req);
      const ts = now();
      stmts.upsertConv.run(convMatch[1], body.title || 'New chat', ts, ts);
      return json(res, { ok: true });
    }

    // DELETE /api/conversations/:id
    if (method === 'DELETE' && convMatch) {
      stmts.deleteConv.run(convMatch[1]);
      return json(res, { ok: true });
    }

    // GET /api/conversations/:id/messages
    if (method === 'GET' && msgListMatch) {
      const messages = stmts.listMsgs.all(msgListMatch[1]).map(formatMessage);
      return json(res, messages);
    }

    // POST /api/conversations/:id/messages
    if (method === 'POST' && msgListMatch) {
      const convId = msgListMatch[1];
      const body = await parseBody(req);
      const ts = now();
      const info = stmts.insertMsg.run(
        convId,
        body.role || 'user',
        body.content || '',
        body.reasoning || '',
        JSON.stringify(body.sources || []),
        body.search_query || body.searchQuery || '',
        JSON.stringify(body.files || []),
        JSON.stringify(body.images || []),
        JSON.stringify(body.tool_calls || body.toolCalls || []),
        ts,
      );
      stmts.touchConv.run(ts, convId);
      return json(res, { id: Number(info.lastInsertRowid) }, 201);
    }

    // PUT /api/messages/:id
    if (method === 'PUT' && msgUpdateMatch) {
      const body = await parseBody(req);
      stmts.updateMsg.run(
        body.content ?? '',
        body.reasoning ?? '',
        JSON.stringify(body.sources || []),
        body.search_query || body.searchQuery || '',
        JSON.stringify(body.tool_calls || body.toolCalls || []),
        parseInt(msgUpdateMatch[1], 10),
      );
      return json(res, { ok: true });
    }

    // POST /api/export — save raw log to raw_logs/ directory
    if (method === 'POST' && path === '/api/export') {
      const body = await parseBody(req);
      const { filename, content } = body;
      if (!filename || !content) {
        return json(res, { ok: false, error: 'Missing filename or content' }, 400);
      }
      const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
      const dir = join(process.cwd(), 'raw_logs');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const filePath = join(dir, safe);
      writeFileSync(filePath, content, 'utf-8');
      console.log(`[api-server] Exported log: ${filePath}`);
      return json(res, { ok: true, path: filePath });
    }

    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    console.error('[api-server]', err);
    json(res, { error: err.message }, 500);
  }
}

async function handleToolRequest(req, res, method, path) {
  // GET /api/tools
  if (method === 'GET' && path === '/api/tools') {
    return json(res, listTools());
  }

  // POST /api/tools/execute
  if (method === 'POST' && path === '/api/tools/execute') {
    const body = await parseBody(req);
    const { tool, params, approved } = body;

    if (!tool) {
      return json(res, { ok: false, error: 'Missing tool name', code: 'ERROR' }, 400);
    }

    const result = await executeTool(tool, params || {}, { approved: !!approved });
    const status = result.ok ? 200 : (result.code === 'BLOCKED' ? 403 : result.code === 'UNKNOWN_TOOL' ? 404 : 200);
    return json(res, result, status);
  }

  return false;
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`[api-server] Klanker API running on http://localhost:${PORT}`);
});
