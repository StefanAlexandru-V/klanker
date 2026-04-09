/**
 * Prompt Test Runner
 *
 * Sends multi-turn conversations through the real LLM + tool pipeline
 * and evaluates responses against assertion functions.
 *
 * Usage:
 *   node server/prompt-tests/runner.js [--model <id>] [--filter <pattern>] [--verbose]
 *
 * Requires:
 *   - LM Studio running at LM_STUDIO_URL (default: http://10.3.58.20:1234/v1)
 *   - API server running at API_SERVER_URL (default: http://localhost:3100)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildToolPrompt } from './prompt-utils.js';

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://10.3.58.20:1234/v1';
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:3100';

const TOOL_PATTERN = /\[TOOL:\s*(\w+)\s+(\{.*?\})\]/s;
const TOOL_INCOMPLETE = /\[TOOL:\s*(\w+)\s+(\{.*?)$/s;
const SEARCH_PATTERN = /\[SEARCH:\s*(.+?)\]/;
const MAX_TOOL_ROUNDS = 5;
const THINKING_HEADERS = /^\s*(Thought process|Thinking Process|<think>)[:\s]*/i;

// ── CLI args ──

const args = process.argv.slice(2);
let filterPattern = null;
let verbose = false;
let targetModel = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filter' && args[i + 1]) filterPattern = args[++i];
  else if (args[i] === '--model' && args[i + 1]) targetModel = args[++i];
  else if (args[i] === '--verbose') verbose = true;
}

// ── Core: LLM streaming ──

async function streamCompletion(model, messages) {
  const res = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    throw new Error(`LLM API error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let reasoning = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let start = 0;
    while (start < buffer.length) {
      const idx = buffer.indexOf('data: ', start);
      if (idx === -1) break;

      const payload = buffer.slice(idx + 6);
      if (payload.startsWith('[DONE]')) { reader.releaseLock(); return { fullText, reasoning }; }

      let parsed;
      try { parsed = JSON.parse(payload); } catch {
        const nextIdx = buffer.indexOf('data: ', idx + 6);
        if (nextIdx === -1) break;
        const segment = buffer.slice(idx + 6, nextIdx).trim();
        if (segment === '[DONE]') { reader.releaseLock(); return { fullText, reasoning }; }
        try { parsed = JSON.parse(segment); } catch { start = nextIdx; continue; }
      }

      const delta = parsed.choices?.[0]?.delta;
      if (delta?.reasoning_content) reasoning += delta.reasoning_content;
      if (delta?.content) fullText += delta.content;

      const nextData = buffer.indexOf('data: ', idx + 6);
      start = nextData === -1 ? buffer.length : nextData;
    }
    if (start > 0) buffer = buffer.slice(start);
  }

  reader.releaseLock();
  return { fullText, reasoning };
}

// ── Core: Tool execution ──

function parseTool(text) {
  if (!text) return null;
  const trimmed = text.trim();

  let match = trimmed.match(TOOL_PATTERN);
  if (match) {
    try { return { tool: match[1], params: JSON.parse(match[2]) }; } catch {}
  }

  match = trimmed.match(TOOL_INCOMPLETE);
  if (match) {
    try { return { tool: match[1], params: JSON.parse(match[2] + '}') }; } catch {
      const raw = match[2];
      const cmdMatch = raw.match(/"cmd"\s*:\s*"([^"]+)"/);
      const queryMatch = raw.match(/"query"\s*:\s*"([^"]+)"/);
      const pathMatch = raw.match(/"path"\s*:\s*"([^"]+)"/);
      if (cmdMatch) return { tool: match[1], params: { cmd: cmdMatch[1] } };
      if (queryMatch) return { tool: match[1], params: { query: queryMatch[1] } };
      if (pathMatch) return { tool: match[1], params: { path: pathMatch[1] } };
    }
  }

  match = trimmed.match(SEARCH_PATTERN);
  if (match) return { tool: 'search', params: { query: match[1].trim() } };

  return null;
}

function stripThinking(text) {
  let clean = text;
  const thinkOpen = clean.search(/<think>/i);
  if (thinkOpen !== -1) {
    const thinkClose = clean.search(/<\/think>/i);
    if (thinkClose !== -1) {
      clean = (clean.slice(0, thinkOpen) + clean.slice(thinkClose + 8)).trim();
    } else {
      clean = clean.slice(0, thinkOpen).trim();
    }
    return clean;
  }

  const headerMatch = clean.match(THINKING_HEADERS);
  if (headerMatch) {
    const toolParsed = parseTool(clean.slice(headerMatch[0].length));
    if (toolParsed) {
      const directiveMatch = clean.match(/\[(?:TOOL|SEARCH):/);
      if (directiveMatch) return clean.slice(clean.indexOf(directiveMatch[0])).trim();
    }
    return '';
  }
  return clean;
}

async function executeTool(tool, params) {
  if (tool === 'search') {
    return { ok: true, output: `[Search simulation] Results for "${params.query}": No real results in test mode.`, type: 'search' };
  }

  const res = await fetch(`${API_SERVER_URL}/api/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, params, approved: true }),
  });
  return res.json();
}

// ── Core: Full conversation turn ──

async function runTurn(model, messages) {
  const toolCalls = [];
  let toolRounds = 0;
  let currentMessages = [...messages];

  let { fullText, reasoning } = await streamCompletion(model, currentMessages);

  // Strip thinking if present
  if (THINKING_HEADERS.test(fullText.trim()) || /<think>/i.test(fullText)) {
    fullText = stripThinking(fullText);
  }

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const parsed = parseTool(fullText);
    if (!parsed) break;
    toolRounds++;

    // Execute tool
    const result = await executeTool(parsed.tool, parsed.params);
    const output = result.ok
      ? (result.content || result.output || '')
      : `Error: ${result.error}`;
    const cwdNote = result.cwd ? `\n(working directory: ${result.cwd})` : '';

    toolCalls.push({
      tool: parsed.tool,
      params: parsed.params,
      ok: result.ok,
      output,
      cwd: result.cwd,
    });

    // Add exchange to history
    currentMessages.push(
      { role: 'assistant', content: fullText },
      { role: 'user', content: `[Tool result]: Tool "${parsed.tool}" output:\n${output}${cwdNote}` },
    );

    // Re-prompt
    const next = await streamCompletion(model, currentMessages);
    fullText = next.fullText;
    reasoning += next.reasoning;

    if (THINKING_HEADERS.test(fullText.trim()) || /<think>/i.test(fullText)) {
      fullText = stripThinking(fullText);
    }
  }

  return {
    response: fullText.trim(),
    reasoning: reasoning.trim(),
    toolCalls,
    messages: currentMessages,
  };
}

// ── Test execution engine ──

/**
 * @typedef {object} TestCase
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} turns — user messages to send in sequence
 * @property {Array<(result: TurnResult) => AssertionResult>} [assertions] — per-turn assertions
 * @property {(results: TurnResult[]) => AssertionResult[]} [multiTurnAssertions] — cross-turn assertions
 */

/**
 * @typedef {object} TurnResult
 * @property {string} response
 * @property {string} reasoning
 * @property {Array<{tool: string, params: object, ok: boolean, output: string}>} toolCalls
 */

/**
 * @typedef {object} AssertionResult
 * @property {boolean} pass
 * @property {string} name
 * @property {string} [detail]
 */

const CURRENT_DATE = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

async function runTest(model, test, systemPrompt) {
  const results = [];
  let conversationMessages = [
    { role: 'system', content: systemPrompt },
  ];

  for (let i = 0; i < test.turns.length; i++) {
    const userMsg = test.turns[i];
    conversationMessages.push({ role: 'user', content: userMsg });

    const turn = await runTurn(model, conversationMessages);
    results.push(turn);

    // Add assistant response to conversation for next turn
    conversationMessages = turn.messages;
    conversationMessages.push({ role: 'assistant', content: turn.response });
  }

  // Run per-turn assertions
  const assertionResults = [];
  if (test.assertions) {
    for (let i = 0; i < test.assertions.length && i < results.length; i++) {
      if (test.assertions[i]) {
        const turnAssertions = test.assertions[i](results[i]);
        assertionResults.push(...(Array.isArray(turnAssertions) ? turnAssertions : [turnAssertions]));
      }
    }
  }

  // Run multi-turn assertions
  if (test.multiTurnAssertions) {
    const crossAssertions = test.multiTurnAssertions(results);
    assertionResults.push(...crossAssertions);
  }

  return { test, results, assertionResults };
}

// ── Assertion helpers (exported for test files) ──

function normalizeText(s) {
  return s.replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201C\u201D\u2033]/g, '"');
}

export function assertContains(name, text, substring) {
  const pass = normalizeText(text).toLowerCase().includes(substring.toLowerCase());
  return { pass, name, detail: pass ? undefined : `Expected to contain "${substring}" but got:\n${text.slice(0, 200)}` };
}

export function assertNotContains(name, text, substring) {
  const pass = !normalizeText(text).toLowerCase().includes(substring.toLowerCase());
  return { pass, name, detail: pass ? undefined : `Expected NOT to contain "${substring}" but found it in:\n${text.slice(0, 200)}` };
}

export function assertToolUsed(name, toolCalls, toolName) {
  const pass = toolCalls.some(tc => tc.tool === toolName);
  return { pass, name, detail: pass ? undefined : `Expected tool "${toolName}" to be used but got: ${toolCalls.map(tc => tc.tool).join(', ') || 'none'}` };
}

export function assertToolNotUsed(name, toolCalls, toolName) {
  const pass = !toolCalls.some(tc => tc.tool === toolName);
  return { pass, name, detail: pass ? undefined : `Expected tool "${toolName}" NOT to be used but it was` };
}

export function assertToolParam(name, toolCalls, toolName, paramKey, expected) {
  const tc = toolCalls.find(t => t.tool === toolName);
  if (!tc) return { pass: false, name, detail: `Tool "${toolName}" not found in calls` };
  const actual = tc.params[paramKey];
  if (typeof expected === 'function') {
    const pass = expected(actual);
    return { pass, name, detail: pass ? undefined : `Param "${paramKey}" = "${actual}" did not match predicate` };
  }
  if (expected instanceof RegExp) {
    const pass = expected.test(actual || '');
    return { pass, name, detail: pass ? undefined : `Param "${paramKey}" = "${actual}" did not match ${expected}` };
  }
  const pass = actual === expected;
  return { pass, name, detail: pass ? undefined : `Param "${paramKey}" expected "${expected}" but got "${actual}"` };
}

export function assertMatches(name, text, regex) {
  const pass = regex.test(text);
  return { pass, name, detail: pass ? undefined : `Expected to match ${regex} but got:\n${text.slice(0, 200)}` };
}

export function assertResponseLength(name, text, { min, max }) {
  const len = text.length;
  const pass = (min === undefined || len >= min) && (max === undefined || len <= max);
  return { pass, name, detail: pass ? undefined : `Response length ${len} not in range [${min ?? '...'}, ${max ?? '...'}]` };
}

export function assertNoHallucination(name, text, forbiddenPatterns) {
  for (const pat of forbiddenPatterns) {
    const regex = typeof pat === 'string' ? new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : pat;
    if (regex.test(text)) {
      return { pass: false, name, detail: `Found hallucinated pattern: ${pat}` };
    }
  }
  return { pass: true, name };
}

// ── Build system prompt (mirrors store.svelte.js) ──

async function buildSystemPrompt() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/tools`);
    if (!res.ok) throw new Error('Failed to fetch tools');
    const tools = await res.json();
    const base = buildToolPrompt(tools);
    return getBasePrompt() + (base ? '\n\n' + base : '');
  } catch {
    return getBasePrompt();
  }
}

function getBasePrompt() {
  return `You are Klanker, a knowledgeable and helpful personal assistant.
Current date: ${CURRENT_DATE}.
Your training data has a knowledge cutoff around early 2024. You may not have accurate information about events after that date.

# Core behavior
- Match the user's tone and formality. Keep casual exchanges short and natural.
- Give concise answers to simple questions. Give thorough, well-structured answers to complex ones.
- Never open with flattery ("Great question!", "That's an excellent point!"). Respond directly.
- If you cannot help with something, say so briefly without lecturing or moralizing.
- Ask at most one clarifying question per response, and only when genuinely needed.
- Have opinions. You are allowed to share your perspective on subjective topics. Don't hide behind "as an AI" disclaimers.

# Vision
- You CAN see and analyze images that users attach. Describe them directly.
- Do NOT say you cannot see images — you can.

# Accuracy and honesty
- If you are unsure about a fact, say so explicitly rather than guessing.
- If the user makes a claim you doubt, check it rather than blindly agreeing.
- For anything that may have changed after your knowledge cutoff (news, prices, people in office, software versions, events), use your tools.
- When you use information from search results, cite sources with [1], [2], etc.
- Never fabricate URLs, citations, statistics, or quotes.
- NEVER invent file names, paths, or directory names. Use ONLY exact names from tool output.
- If a command fails, READ the error message carefully and fix the exact problem. Do not guess or repeat the same mistake.

# Formatting
- Use plain prose for conversational replies. No bullet lists or markdown in casual chat.
- Use markdown (headings, lists, tables, code blocks) for technical content, comparisons, or structured information.
- Use code blocks with language tags for any code snippets.`;
}

// ── Main ──

async function loadTests() {
  const dir = join(import.meta.dirname, 'cases');
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  const tests = [];

  for (const f of files) {
    const mod = await import(join(dir, f));
    const cases = mod.default || mod.tests || [];
    tests.push(...cases);
  }

  return tests;
}

async function main() {
  console.log('\n🧪 Klanker Prompt Test Suite\n');

  // Get available models
  const modelsRes = await fetch(`${LM_STUDIO_URL}/models`);
  const modelsData = await modelsRes.json();
  const models = (modelsData.data || []).map(m => m.id).filter(id => !id.includes('embed'));

  if (models.length === 0) {
    console.error('No models available in LM Studio');
    process.exit(1);
  }

  const testModels = targetModel ? [targetModel] : models;
  console.log(`Models: ${testModels.join(', ')}`);

  // Load tests
  let tests = await loadTests();
  if (filterPattern) {
    const re = new RegExp(filterPattern, 'i');
    tests = tests.filter(t => re.test(t.name));
  }
  console.log(`Tests:  ${tests.length}`);

  // Build system prompt
  const systemPrompt = await buildSystemPrompt();

  // Run
  const allResults = [];
  let totalPass = 0;
  let totalFail = 0;
  let totalTests = 0;

  for (const model of testModels) {
    console.log(`\n━━━ Model: ${model} ━━━\n`);

    for (const test of tests) {
      totalTests++;
      process.stdout.write(`  ${test.name} ... `);

      try {
        const result = await runTest(model, test, systemPrompt);
        const passed = result.assertionResults.every(a => a.pass);
        const failCount = result.assertionResults.filter(a => !a.pass).length;
        const passCount = result.assertionResults.filter(a => a.pass).length;

        if (passed) {
          totalPass++;
          console.log(`✅ (${passCount} assertions)`);
        } else {
          totalFail++;
          console.log(`❌ (${failCount}/${result.assertionResults.length} failed)`);
          for (const a of result.assertionResults.filter(x => !x.pass)) {
            console.log(`    ✗ ${a.name}: ${a.detail}`);
          }
        }

        if (verbose) {
          for (let i = 0; i < result.results.length; i++) {
            const r = result.results[i];
            console.log(`    Turn ${i + 1}: "${test.turns[i]}"`);
            if (r.toolCalls.length) {
              for (const tc of r.toolCalls) {
                console.log(`      🔧 ${tc.tool}(${JSON.stringify(tc.params)}) → ${tc.ok ? 'ok' : 'fail'}`);
              }
            }
            console.log(`      → ${r.response.slice(0, 120).replace(/\n/g, '\\n')}...`);
          }
        }

        allResults.push({ model, test: test.name, passed, assertions: result.assertionResults, results: result.results });
      } catch (err) {
        totalFail++;
        console.log(`💥 ERROR: ${err.message}`);
        allResults.push({ model, test: test.name, passed: false, error: err.message });
      }
    }
  }

  // Summary
  console.log(`\n━━━ Summary ━━━`);
  console.log(`  Total:  ${totalTests}`);
  console.log(`  Passed: ${totalPass}`);
  console.log(`  Failed: ${totalFail}`);
  console.log('');

  // Write report
  const reportDir = join(import.meta.dirname, '..', '..', 'raw_logs');
  mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = join(reportDir, `${ts}_prompt-test-report.json`);
  writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`Report: ${reportPath}`);

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
