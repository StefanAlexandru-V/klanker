/**
 * Client-side tool directive parsing and API client.
 *
 * Parses [TOOL: name {params}] directives from model output,
 * handles [SEARCH:] backwards compatibility, and provides
 * the API client for /api/tools/execute.
 *
 * @module tools
 */

const API_BASE = '/api';

/**
 * @typedef {object} ParsedTool
 * @property {string} tool
 * @property {object} params
 */

const TOOL_PATTERN = /\[TOOL:\s*(\w+)\s+(\{.*?\})\]/s;
const TOOL_INCOMPLETE = /\[TOOL:\s*(\w+)\s+(\{.*?)$/s;
const SEARCH_PATTERN = /\[SEARCH:\s*(.+?)\]/;
const SEARCH_INCOMPLETE = /\[SEARCH:\s*(.+?)\s*$/;

/**
 * Parse a tool directive from model output.
 * Handles both [TOOL: name {params}] and [SEARCH: query] formats.
 * Returns null if no directive found.
 *
 * @param {string} text
 * @returns {ParsedTool|null}
 */
export function parseTool(text) {
  if (!text) return null;
  const trimmed = text.trim();

  // Try [TOOL: name {params}] first
  let match = trimmed.match(TOOL_PATTERN);
  if (match) {
    try {
      const params = JSON.parse(match[2]);
      return { tool: match[1], params };
    } catch {
      // JSON parse failed — try to extract anyway
    }
  }

  // Try incomplete [TOOL: name {params (missing closing bracket)
  match = trimmed.match(TOOL_INCOMPLETE);
  if (match) {
    try {
      // Try adding closing brace and bracket
      const params = JSON.parse(match[2] + '}');
      return { tool: match[1], params };
    } catch {
      // Try to extract key-value pairs from malformed JSON
      const raw = match[2];
      const cmdMatch = raw.match(/"cmd"\s*:\s*"([^"]+)"/);
      const queryMatch = raw.match(/"query"\s*:\s*"([^"]+)"/);
      const pathMatch = raw.match(/"path"\s*:\s*"([^"]+)"/);
      if (cmdMatch) return { tool: match[1], params: { cmd: cmdMatch[1] } };
      if (queryMatch) return { tool: match[1], params: { query: queryMatch[1] } };
      if (pathMatch) return { tool: match[1], params: { path: pathMatch[1] } };
    }
  }

  // Try [SEARCH: query] (backwards compat)
  match = trimmed.match(SEARCH_PATTERN);
  if (match) {
    return { tool: 'search', params: { query: match[1].trim() } };
  }

  // Try incomplete [SEARCH: query (missing ])
  match = trimmed.match(SEARCH_INCOMPLETE);
  if (match) {
    return { tool: 'search', params: { query: match[1].trim() } };
  }

  return null;
}

/**
 * Check if text contains a tool directive (complete or in-progress).
 * Used for buffering during streaming.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasToolDirective(text) {
  if (!text) return false;
  const trimmed = text.trim();
  return TOOL_PATTERN.test(trimmed)
    || TOOL_INCOMPLETE.test(trimmed)
    || SEARCH_PATTERN.test(trimmed)
    || SEARCH_INCOMPLETE.test(trimmed)
    || trimmed.includes('[TOOL:')
    || trimmed.includes('[SEARCH:');
}

/**
 * Check if text contains an incomplete (still buffering) tool directive.
 * @param {string} text
 * @returns {boolean}
 */
export function hasIncompleteDirective(text) {
  if (!text) return false;
  const trimmed = text.trim();

  // Has opening but no closing
  const toolIdx = trimmed.lastIndexOf('[TOOL:');
  if (toolIdx !== -1) {
    const after = trimmed.slice(toolIdx);
    if (!after.includes(']')) return true;
  }

  const searchIdx = trimmed.lastIndexOf('[SEARCH:');
  if (searchIdx !== -1) {
    const after = trimmed.slice(searchIdx);
    if (!after.includes(']')) return true;
  }

  return false;
}

/**
 * Execute a tool via the API server.
 *
 * @param {string} tool — tool name
 * @param {object} params — tool parameters
 * @param {boolean} [approved=false] — whether user approved this call
 * @returns {Promise<object>}
 */
export async function executeTool(tool, params, approved = false) {
  const res = await fetch(`${API_BASE}/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, params, approved }),
  });
  const data = await res.json();
  if (!res.ok && !data.code) {
    throw new Error(data.error || `Tool execution failed (${res.status})`);
  }
  return data;
}

/**
 * Fetch available tools from the API server.
 * @returns {Promise<Array<{ name: string, description: string, params: object, requiresApproval: boolean }>>}
 */
export async function fetchTools() {
  const res = await fetch(`${API_BASE}/tools`);
  if (!res.ok) return [];
  return res.json();
}

/**
 * Build the tools section for the system prompt.
 * @param {Array<{ name: string, description: string, params: object }>} tools
 * @returns {string}
 */
export function buildToolPrompt(tools) {
  if (!tools || tools.length === 0) return '';

  const toolDescs = tools.map((t, i) => {
    const paramStr = Object.entries(t.params)
      .map(([k, v]) => `"${k}": "${v.description || v.type}"${v.optional ? ' (optional)' : ''}`)
      .join(', ');
    return `${i + 1}. ${t.name} — ${t.description}\n   Parameters: {${paramStr}}`;
  }).join('\n\n');

  return `# Tools
You have access to tools that let you interact with the user's local system. You are running on their machine with access to their home directory.

## How to use a tool
Output ONLY this exact format as your COMPLETE response:

[TOOL: tool_name {"param": "value"}]

Rules:
- The [TOOL: ...] line must be your ENTIRE response. No other text.
- Do NOT wrap it in markdown, code blocks, or any formatting.
- Both brackets [ ] are REQUIRED. The params must be valid JSON.
- You may also use the shorthand [SEARCH: query] for web searches.

## Available tools

${toolDescs}

## Environment
- Operating system: Linux
- Shell commands run in /bin/sh with a 30-second timeout
- Working directory defaults to the user's home (~)
- File paths are restricted to the home directory tree
- Destructive commands require user approval; safe read-only commands auto-execute

## How to use tools effectively
- If a command fails, READ THE ERROR and adapt. Try a different path, flag, or approach.
- Paths are case-sensitive. If \`~/projects\` fails, try \`ls ~\` first to see what actually exists, then use the correct name.
- You can chain multiple tool rounds. Don't give up after one failure — you have up to 5 rounds.
- After getting tool output, answer the user's question using that data. Use the MOST RECENT tool result.
- If a tool is denied or blocked, respond helpfully using what you already know.
- Keep commands simple. Prefer \`ls\`, \`cat\`, \`grep\` over complex one-liners.`;
}
