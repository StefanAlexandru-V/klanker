/**
 * Tool registry — defines available tools and their executors.
 *
 * Each tool has a name, description, parameter schema, and execute function.
 * The registry is used by the API server to route tool calls
 * and by the system prompt generator to describe available tools.
 *
 * @module registry
 */

import { executeShell } from './shell.js';
import { readFileSafe } from './readFile.js';

/**
 * @typedef {object} ToolDef
 * @property {string} name
 * @property {string} description
 * @property {object} params — JSON schema-like description of params
 * @property {boolean} requiresApproval — whether some invocations need user approval
 * @property {(params: object, options?: { approved?: boolean }) => Promise<object>} execute
 */

/** @type {ToolDef[]} */
const tools = [
  {
    name: 'search',
    description: 'Search the web for current information',
    params: { query: { type: 'string', description: 'Search keywords (3-8 words)' } },
    requiresApproval: false,
    async execute(params) {
      const { query } = params;
      if (!query || !query.trim()) {
        return { ok: false, error: 'No search query provided', code: 'ERROR' };
      }
      // Search is executed client-side via SearXNG — the server just validates
      // and returns a marker so the client knows to run the search
      return { ok: true, type: 'search', query: query.trim() };
    },
  },
  {
    name: 'shell',
    description: 'Run a command in the local terminal',
    params: {
      cmd: { type: 'string', description: 'Shell command to execute' },
      cwd: { type: 'string', description: 'Working directory (optional, defaults to $HOME)', optional: true },
    },
    requiresApproval: true,
    async execute(params, options = {}) {
      return executeShell({ ...params, approved: options.approved });
    },
  },
  {
    name: 'read_file',
    description: 'Read a file\'s contents',
    params: { path: { type: 'string', description: 'Absolute or ~-relative file path' } },
    requiresApproval: false,
    async execute(params) {
      return readFileSafe(params);
    },
  },
];

/**
 * Get a tool by name.
 * @param {string} name
 * @returns {ToolDef|undefined}
 */
export function getTool(name) {
  return tools.find((t) => t.name === name);
}

/**
 * Get all tool definitions (for system prompt and GET /api/tools).
 * @returns {Array<{ name: string, description: string, params: object, requiresApproval: boolean }>}
 */
export function listTools() {
  return tools.map(({ name, description, params, requiresApproval }) => ({
    name,
    description,
    params,
    requiresApproval,
  }));
}

/**
 * Execute a tool by name.
 * @param {string} name
 * @param {object} params
 * @param {{ approved?: boolean }} [options]
 * @returns {Promise<object>}
 */
export async function executeTool(name, params, options = {}) {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}`, code: 'UNKNOWN_TOOL' };
  }

  const start = Date.now();
  const result = await tool.execute(params, options);
  const duration = Date.now() - start;

  console.log(`[tools] ${name}: ${JSON.stringify(params)} → ${result.ok ? 'ok' : result.code} (${duration}ms)`);

  return { ...result, duration };
}
