/**
 * Shared prompt utilities — used by both the runner and production store.
 * This mirrors the buildToolPrompt from src/lib/tools.js for server-side use.
 * @module prompt-utils
 */

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
- The [TOOL: ...] line must be your ENTIRE response. No other text before or after it.
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

## CRITICAL: How to use tools correctly

### Use exact paths from tool output
- NEVER guess, fabricate, or modify file/directory names. Use ONLY the exact names returned by previous tool output.
- If \`ls ~/Projects\` shows \`klanker\`, the path is \`~/Projects/klanker\` — not \`klanker_\`, not \`Klanker\`, not anything else.
- Paths are case-sensitive. Copy them exactly.

### Use the cwd parameter for shell commands
- When the user refers to a project directory, set \`cwd\` to that path instead of \`cd\`-ing.
- Example: \`[TOOL: shell {"cmd": "npm list", "cwd": "~/Projects/myproject"}]\`
- When the user says "in the same spot" or "there", reuse the same cwd from the previous command.

### Learn from errors — never repeat the same mistake
- If a command fails, READ THE ERROR MESSAGE carefully. It tells you what went wrong.
- Fix the exact problem (wrong path, wrong command, missing flag) — do NOT retry the same command.
- If a path doesn't exist, use \`ls\` to find the correct path before trying again.
- Some commands (like \`npm outdated\`) return non-zero exit codes even on success. If the output contains useful data, use it despite the "error" status.

### General tool usage
- You can chain multiple tool rounds. Don't give up after one failure — you have up to 5 rounds.
- After getting tool output, answer the user's question using that data. Use the MOST RECENT tool result.
- If a tool is denied or blocked, respond helpfully using what you already know.
- Keep commands simple. Prefer \`ls\`, \`cat\`, \`grep\`, \`find\` over complex one-liners.
- When a previous tool already returned the information you need, use it — don't run the same command again.`;
}
