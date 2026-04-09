/**
 * E2E tests for the tool API endpoints.
 * Run with: node server/test-tools.js
 * Requires the API server running on port 3100.
 */

const BASE = 'http://localhost:3100/api';
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \u2717 ${name}: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function run() {
  console.log('\nTool API E2E Tests\n');

  await test('GET /api/tools — lists available tools', async () => {
    const res = await fetch(`${BASE}/tools`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'Expected array');
    assert(data.length >= 3, `Expected at least 3 tools, got ${data.length}`);
    const names = data.map((t) => t.name);
    assert(names.includes('search'), 'Missing search tool');
    assert(names.includes('shell'), 'Missing shell tool');
    assert(names.includes('read_file'), 'Missing read_file tool');
    for (const tool of data) {
      assert(tool.description, `Tool ${tool.name} missing description`);
      assert(tool.params, `Tool ${tool.name} missing params`);
    }
  });

  await test('POST /api/tools/execute — shell safe command', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell', params: { cmd: 'echo hello-from-test' } }),
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.ok === true, `Expected ok: true, got ${data.ok}`);
    assert(data.output.trim() === 'hello-from-test', `Wrong output: ${data.output}`);
    assert(typeof data.duration === 'number', 'Expected duration');
  });

  await test('POST /api/tools/execute — shell blocked command', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell', params: { cmd: 'rm -rf /' } }),
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    const data = await res.json();
    assert(data.ok === false);
    assert(data.code === 'BLOCKED');
  });

  await test('POST /api/tools/execute — shell needs approval', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell', params: { cmd: 'touch /tmp/klanker-test-xyz' } }),
    });
    const data = await res.json();
    assert(data.ok === false);
    assert(data.code === 'NEEDS_APPROVAL');
  });

  await test('POST /api/tools/execute — shell approved command', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell', params: { cmd: 'echo approved-test > /dev/null' }, approved: true }),
    });
    const data = await res.json();
    assert(data.ok === true, `Expected ok, got ${JSON.stringify(data)}`);
  });

  await test('POST /api/tools/execute — shell with cwd', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell', params: { cmd: 'pwd', cwd: '~' } }),
    });
    const data = await res.json();
    assert(data.ok === true);
    assert(data.output.trim().length > 0, 'Expected pwd output');
  });

  await test('POST /api/tools/execute — read_file', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'read_file', params: { path: '~/.bashrc' } }),
    });
    const data = await res.json();
    // .bashrc may or may not exist — just verify the shape
    if (data.ok) {
      assert(typeof data.content === 'string', 'Expected string content');
    } else {
      assert(data.code === 'NOT_FOUND' || data.code === 'ERROR', `Unexpected code: ${data.code}`);
    }
  });

  await test('POST /api/tools/execute — read_file blocked path', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'read_file', params: { path: '/etc/shadow' } }),
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    const data = await res.json();
    assert(data.ok === false);
    assert(data.code === 'BLOCKED');
  });

  await test('POST /api/tools/execute — search tool', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'search', params: { query: 'test query' } }),
    });
    const data = await res.json();
    assert(data.ok === true);
    assert(data.type === 'search');
    assert(data.query === 'test query');
  });

  await test('POST /api/tools/execute — unknown tool', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'hacker_tool', params: {} }),
    });
    assert(res.status === 404, `Expected 404, got ${res.status}`);
    const data = await res.json();
    assert(data.code === 'UNKNOWN_TOOL');
  });

  await test('POST /api/tools/execute — missing tool name', async () => {
    const res = await fetch(`${BASE}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { cmd: 'ls' } }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Verify existing API still works
  await test('GET /api/conversations — existing API unbroken', async () => {
    const res = await fetch(`${BASE}/conversations`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'Expected array');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
