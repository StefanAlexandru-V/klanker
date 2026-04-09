# Spec: Tool Use Framework + Local Shell

## Objective

Turn Klanker from a chatbot-with-search into a general-purpose agent that can use multiple tools — starting with web search (existing) and a local command shell (new). The model decides which tool to call, the app executes it in a sandbox, and feeds results back for the model to reason over.

**User stories:**
- "Hey Klanker, what's using port 3000?" → runs `lsof -ti :3000`, returns answer
- "List my recent git commits" → runs `git log --oneline -10`, shows output
- "Restart SearXNG" → runs `docker restart klanker-searxng`, confirms
- "Search the web for Gemma 4 benchmarks" → web search (existing, just reframed as a tool)
- "Read my .bashrc" → reads file, summarizes content
- "What's my disk usage?" → runs `df -h`, formats answer

**Success looks like:** The model can chain search + shell in a single conversation turn, the UI clearly shows which tool was called and its output, and dangerous commands require user approval before execution.

## Assumptions

1. This targets the **web app first** — voice app gets tool support later (separate spec)
2. Commands run on the **same machine as the API server** (WSL/Linux) via Node.js `child_process`
3. We use a **text-based directive format** (not OpenAI function calling) since LM Studio doesn't support native tool_use in all models
4. Gemma 4 27B is the primary target model — format must work well with its instruction following
5. The API server (`server/api.js`) is the execution boundary — the browser never runs commands directly
6. We keep the existing `[SEARCH:]` format working alongside the new tool format for backwards compatibility during migration, then deprecate it

## Tool Directive Format

### Model Output Format

The model outputs tool calls as its **complete response** (same constraint as current search):

```
[TOOL: tool_name {"param": "value"}]
```

Examples:
```
[TOOL: search {"query": "Gemma 4 benchmarks 2026"}]
[TOOL: shell {"cmd": "git log --oneline -10"}]
[TOOL: read_file {"path": "~/.bashrc"}]
```

### Why This Format

- Extends the proven `[SEARCH:]` pattern — the model already follows this
- JSON params are unambiguous and parseable
- Single-line, easy to regex match
- Works with any model (no function-calling API dependency)
- Graceful degradation: if model outputs malformed JSON, we can still extract intent

### Migration from `[SEARCH:]`

During transition:
1. `[SEARCH: query]` continues to work (matched first, converted internally to `[TOOL: search {"query": "..."}]`)
2. `[TOOL: search {"query": "..."}]` is the new canonical form
3. System prompt teaches both, prefers `[TOOL:]`
4. After confirming Gemma handles `[TOOL:]` reliably, remove `[SEARCH:]` from the prompt (keep the regex fallback in code)

## Tool Registry

Tools are defined as simple objects with a name, description, parameter schema, and execution function. The registry is injected into the system prompt so the model knows what's available.

### Built-in Tools

#### `search`
- **Description:** Search the web for current information
- **Params:** `{"query": "string"}` — 3-8 keyword search query
- **Execution:** Existing SearXNG integration (no change)
- **Confirmation:** Never (safe, read-only)

#### `shell`
- **Description:** Run a command in the local terminal (WSL/Linux)
- **Params:** `{"cmd": "string", "cwd": "string?"}` — command to execute, optional working directory
- **Execution:** `child_process.execFile` via API server with timeout
- **Confirmation:** **Always for destructive/write commands**, never for read-only
- **Timeout:** 30 seconds default, configurable per-call
- **Output:** stdout + stderr, truncated at 10KB
- **cwd:** Defaults to `$HOME`, must resolve under `$HOME`

#### `read_file`
- **Description:** Read a file's contents
- **Params:** `{"path": "string"}` — absolute or ~-relative path
- **Execution:** `fs.readFile` via API server
- **Confirmation:** Never (read-only)
- **Output:** File contents, truncated at 20KB
- **Restrictions:** No binary files, no paths outside home directory

### Tool Schema (for system prompt injection)

```
Available tools:

1. search — Search the web for current information
   Parameters: {"query": "search keywords"}

2. shell — Run a command in the local terminal
   Parameters: {"cmd": "shell command", "cwd": "/optional/working/dir"}
   Note: Destructive commands require user approval.

3. read_file — Read a file's contents
   Parameters: {"path": "/path/to/file"}
```

## Security Model

### Command Classification

Commands are classified into three tiers:

**Safe (auto-execute):**
- Read-only commands: `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `find`, `which`, `whoami`, `pwd`, `echo`, `date`, `uptime`, `df`, `du`, `free`, `ps`, `lsof`, `file`, `stat`
- Git read commands: `git log`, `git status`, `git diff`, `git branch`, `git show`
- Docker read commands: `docker ps`, `docker logs`, `docker images`
- Node/Python info: `node -v`, `python3 --version`, `npm list`

**Requires approval (user must click "Allow"):**
- File writes: `cp`, `mv`, `rm`, `mkdir`, `touch`, anything with `>` or `>>`
- Git writes: `git commit`, `git push`, `git checkout`, `git merge`
- Docker writes: `docker restart`, `docker stop`, `docker start`, `docker rm`
- Package management: `npm install`, `pip install`
- Any command with `sudo`
- Any command not on the safe list

**Blocked (never execute):**
- `rm -rf /`, `rm -rf ~`, or any recursive delete on root/home
- `:(){ :|:& };:` or similar fork bombs
- `curl | sh`, `wget | bash`, or piped-to-shell execution
- Commands containing `sudo su`, `passwd`, or privilege escalation
- Network tools: `nc`, `nmap`, `ssh` (to external hosts)
- Anything that downloads and executes code from the internet

### Sandboxing

- Commands execute as the current user (no privilege escalation)
- Working directory defaults to user's home, configurable
- Timeout kills the process after 30s (configurable, max 120s)
- Output truncated at 10KB to prevent memory issues
- Environment is inherited from the API server process
- No `stdin` — commands must be non-interactive

### Path Restrictions

- `read_file` only serves files under `$HOME` (no `/etc/shadow`, no `/proc`)
- Symlink resolution: resolved path must still be under `$HOME`
- No binary file reading (detect via file magic bytes or extension)

## Architecture

### Web App Flow

```
User message
    │
    ▼
store.send()
    │
    ▼
streamResponse() ← model streams tokens
    │
    ├─ regular content → display in chat
    │
    └─ [TOOL: ...] detected → toolLoop()
        │
        ├─ parse tool name + params
        ├─ check if confirmation needed
        │   ├─ safe → execute immediately
        │   └─ needs approval → show confirmation UI, wait for user
        │
        ├─ POST /api/tools/execute { tool, params }
        │   │
        │   ▼
        │   API server executes tool
        │   │
        │   └─ returns { ok, output, error, truncated }
        │
        ├─ inject tool result into context
        ├─ re-prompt model with result
        └─ stream final response
```

### API Server Endpoints

New endpoints on the existing `server/api.js`:

```
POST /api/tools/execute
  Body: { tool: "shell", params: { cmd: "..." } }
  Returns: { ok: true, output: "...", truncated: false }
           { ok: false, error: "...", code: "BLOCKED" | "TIMEOUT" | "ERROR" }

GET /api/tools
  Returns: [{ name, description, params, requiresApproval }]
```

### UI Components

**ToolCall.svelte** — Rendered inline in the message when a tool is called:
- Shows tool name + params (e.g., "shell: `git log --oneline -10`")
- Shows execution status: pending approval / running / completed / failed
- Collapsible output panel (like ThinkingBlock)
- For approval-required commands: "Allow" / "Deny" buttons

**ToolConfirmation.svelte** — Modal or inline prompt:
- Shows the exact command that will run
- "Allow once" / "Allow and remember" / "Deny"
- "Allow and remember" adds the command pattern to a per-session safe list

### Message Shape Extension

```js
{
  id: 1,
  role: 'assistant',
  content: 'Here are your recent commits: ...',
  reasoning: '...',
  sources: [...],
  toolCalls: [
    {
      id: 'tc_1',
      tool: 'shell',
      params: { cmd: 'git log --oneline -10' },
      status: 'completed',  // 'pending' | 'approved' | 'running' | 'completed' | 'denied' | 'failed'
      output: '...',
      error: null,
      duration: 245,  // ms
    }
  ],
}
```

Persisted in SQLite as a `tool_calls TEXT DEFAULT '[]'` JSON column on the messages table (same pattern as `sources`, `files`, `images`).

### Database Migration

Add `tool_calls` column to the existing messages table:

```sql
ALTER TABLE messages ADD COLUMN tool_calls TEXT DEFAULT '[]';
```

The API server runs this on startup (idempotent — check if column exists first). The `insertMsg`, `updateMsg`, and `formatMessage` statements are extended to include `tool_calls`.

### Store Changes

- `streamResponse()` → detect `[TOOL:]` pattern (alongside existing `[SEARCH:]`)
- New `executeToolCall()` function — sends to API, handles approval flow
- Tool loop replaces search loop (search becomes just another tool)
- Max tool rounds: 5 (up from 3 for search-only)
- Approval state managed in store — UI renders based on `toolCalls[n].status`

### System Prompt Changes

Replace the search-specific section with a general tools section. The tool registry is serialized and appended to the system prompt. This keeps it model-agnostic — the prompt is the API contract, not a function schema.

## Project Structure

New/modified files:

```
server/
  api.js              ← add /api/tools/execute, /api/tools endpoints
  tools/
    registry.js       ← tool definitions + metadata
    shell.js          ← shell executor with safety checks
    readFile.js       ← file reader with path validation
    classify.js       ← command classification (safe/approval/blocked)

src/
  lib/
    store.svelte.js   ← tool loop, replace search loop
    tools.js          ← client-side tool parsing + API client
    search.js         ← unchanged (called by server-side search tool)
  components/
    ToolCall.svelte    ← inline tool call display
    Message.svelte     ← integrate ToolCall rendering
```

## Code Style

Same conventions as existing codebase (see AGENTS.md):
- Plain JS, no TypeScript, JSDoc for type hints
- Svelte 5 runes for reactivity
- No UI libraries, plain CSS with scoped styles
- Linear design system tokens
- Components under 200 lines
- Server code uses ESM imports

## Testing Strategy

- **Unit tests (Vitest):** Tool directive parsing, command classification, path validation
- **Integration tests (Vitest):** Store tool loop with mocked API
- **E2E tests (server/test-tools.js):** API endpoints with real shell execution
- **Security tests:** Blocked command patterns, path traversal, timeout enforcement

Coverage targets:
- Command classifier: 100% — every safe/approval/blocked pattern tested
- Tool parsing: 100% — valid, malformed, incomplete directives
- Store tool loop: same coverage as current search loop tests

## Boundaries

### Always
- Classify every command before execution
- Enforce timeout on all shell commands
- Truncate output to prevent memory issues
- Log all tool executions (tool, params, result, duration)
- Validate paths resolve under $HOME for read_file
- Run tests after every change

### Ask First
- Adding new tools to the registry
- Changing the command classification lists
- Modifying the system prompt format
- Increasing timeout limits

### Never
- Execute commands without classification
- Allow `sudo` or privilege escalation
- Read files outside the home directory
- Execute commands with piped-from-network patterns
- Send command output to external services

## Success Criteria

1. **Model can call `shell` tool** and get real command output fed back
2. **Model can chain tools** — e.g., search then shell in one turn
3. **Safe commands auto-execute**, dangerous commands show approval UI
4. **Blocked commands are rejected** with explanation to model
5. **Tool calls render inline** in the chat with collapsible output
6. **Existing search flow still works** via `[SEARCH:]` backwards compat
7. **All new code has tests** — classifier, parser, store loop, API endpoints
8. **No regression** — existing 39 tests still pass
9. **Works with Gemma 4** — model reliably outputs `[TOOL:]` format

## Decisions (Resolved)

1. **Tool output persisted in SQLite.** Add a `tool_calls` JSON column to the messages table. Conversation continuity matters — reloading a conversation should show what tools ran and their output.

2. **Voice app excluded from this spec.** The voice widget is a separate module. Shell/tool access for voice will be its own spec later.

3. **Session trust escalation: yes.** Approval UI shows "Allow once" and "Allow for this session". The latter adds the command pattern (e.g., `docker restart *`) to an in-memory session allowlist. Cleared on page reload.

4. **Working directory is flexible.** The `shell` tool accepts an optional `cwd` parameter: `{"cmd": "git log", "cwd": "/home/user/project"}`. Defaults to `$HOME` when omitted. Path must resolve under `$HOME`.
