/**
 * Quick E2E test for the SQLite API server.
 * Run with: node server/test-api.js
 * Requires the API server running on port 3100.
 */

const BASE = 'http://localhost:3100/api';
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function run() {
  console.log('\nAPI Server E2E Tests\n');

  // Clean up any leftover test data
  await fetch(`${BASE}/conversations/e2e_test_conv`, { method: 'DELETE' });

  await test('POST /api/conversations — accepts client-provided id', async () => {
    const res = await fetch(`${BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'e2e_test_conv', title: 'E2E Test' }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const data = await res.json();
    assert(data.id === 'e2e_test_conv', `Expected id 'e2e_test_conv', got '${data.id}'`);
    assert(data.title === 'E2E Test', `Expected title 'E2E Test', got '${data.title}'`);
  });

  await test('GET /api/conversations — lists conversations', async () => {
    const res = await fetch(`${BASE}/conversations`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'Expected array');
    assert(data.some(c => c.id === 'e2e_test_conv'), 'Test conversation not found in list');
  });

  await test('GET /api/conversations/:id — returns conversation with messages', async () => {
    const res = await fetch(`${BASE}/conversations/e2e_test_conv`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.id === 'e2e_test_conv', `Wrong id: ${data.id}`);
    assert(Array.isArray(data.messages), 'Expected messages array');
  });

  await test('GET /api/conversations/:id — 404 for missing', async () => {
    const res = await fetch(`${BASE}/conversations/nonexistent_conv_xyz`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  let messageId;
  await test('POST /api/conversations/:id/messages — adds a message', async () => {
    const res = await fetch(`${BASE}/conversations/e2e_test_conv/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        content: 'Hello from E2E test',
        files: [{ name: 'test.txt', content: 'file content', size: 12 }],
        images: [],
      }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const data = await res.json();
    assert(typeof data.id === 'number', `Expected numeric id, got ${typeof data.id}`);
    messageId = data.id;
  });

  await test('POST /api/conversations/:id/messages — adds assistant message', async () => {
    const res = await fetch(`${BASE}/conversations/e2e_test_conv/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'assistant',
        content: 'Hello! I am responding.',
        reasoning: 'Thinking about the response...',
        sources: [{ title: 'Source 1', url: 'https://example.com', content: 'snippet' }],
        searchQuery: 'test query',
      }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
  });

  await test('GET /api/conversations/:id/messages — lists messages', async () => {
    const res = await fetch(`${BASE}/conversations/e2e_test_conv/messages`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.length === 2, `Expected 2 messages, got ${data.length}`);
    assert(data[0].role === 'user', `Expected user message first`);
    assert(data[0].content === 'Hello from E2E test');
    assert(Array.isArray(data[0].files), 'files should be parsed as array');
    assert(data[0].files[0].name === 'test.txt', 'file attachment not preserved');
    assert(data[1].role === 'assistant');
    assert(Array.isArray(data[1].sources), 'sources should be parsed as array');
    assert(data[1].sources.length === 1, 'Expected 1 source');
  });

  await test('PUT /api/messages/:id — updates message content', async () => {
    const res = await fetch(`${BASE}/messages/${messageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Updated E2E content',
        reasoning: 'new reasoning',
        sources: [{ title: 'New', url: 'https://new.com', content: 'new' }],
        search_query: 'updated query',
      }),
    });
    assert(res.ok, `Expected 200, got ${res.status}`);

    // Verify update
    const verify = await fetch(`${BASE}/conversations/e2e_test_conv/messages`);
    const msgs = await verify.json();
    const updated = msgs.find(m => m.id === messageId);
    assert(updated.content === 'Updated E2E content', `Content not updated: ${updated.content}`);
    assert(updated.reasoning === 'new reasoning', `Reasoning not updated`);
  });

  await test('PUT /api/conversations/:id — renames conversation', async () => {
    const res = await fetch(`${BASE}/conversations/e2e_test_conv`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed E2E Test' }),
    });
    assert(res.ok, `Expected 200, got ${res.status}`);

    const verify = await fetch(`${BASE}/conversations/e2e_test_conv`);
    const data = await verify.json();
    assert(data.title === 'Renamed E2E Test', `Title not updated: ${data.title}`);
  });

  await test('DELETE /api/conversations/:id — deletes with cascade', async () => {
    const res = await fetch(`${BASE}/conversations/e2e_test_conv`, { method: 'DELETE' });
    assert(res.ok, `Expected 200, got ${res.status}`);

    const verify = await fetch(`${BASE}/conversations/e2e_test_conv`);
    assert(verify.status === 404, 'Conversation should be gone');

    const msgs = await fetch(`${BASE}/conversations/e2e_test_conv/messages`);
    const msgData = await msgs.json();
    assert(msgData.length === 0, 'Messages should be cascade-deleted');
  });

  await test('PUT /api/conversations/:id — upserts (creates if missing)', async () => {
    const res = await fetch(`${BASE}/conversations/e2e_upsert_test`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Upserted Chat' }),
    });
    assert(res.ok, `Expected 200, got ${res.status}`);

    const verify = await fetch(`${BASE}/conversations/e2e_upsert_test`);
    assert(verify.ok, 'Upserted conversation should exist');
    const data = await verify.json();
    assert(data.title === 'Upserted Chat', `Wrong title: ${data.title}`);

    // Clean up
    await fetch(`${BASE}/conversations/e2e_upsert_test`, { method: 'DELETE' });
  });

  await test('POST /api/conversations — generates id when none provided', async () => {
    const res = await fetch(`${BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Auto-ID Test' }),
    });
    assert(res.status === 201);
    const data = await res.json();
    assert(data.id.startsWith('conv_'), `Expected auto-generated id, got '${data.id}'`);
    // Clean up
    await fetch(`${BASE}/conversations/${data.id}`, { method: 'DELETE' });
  });

  await test('OPTIONS — CORS preflight', async () => {
    const res = await fetch(`${BASE}/conversations`, { method: 'OPTIONS' });
    assert(res.status === 204, `Expected 204, got ${res.status}`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
