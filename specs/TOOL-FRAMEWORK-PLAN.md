# Implementation Plan: Tool Use Framework + Local Shell

## Overview

Add a general-purpose tool system to Klanker, migrating from the hardcoded `[SEARCH:]` directive to a `[TOOL: name {params}]` framework. The first tools are `search` (existing, reframed), `shell` (new), and `read_file` (new). Includes command safety classification, user approval flow, inline UI for tool calls, and SQLite persistence.

## Dependency Graph

```
server/tools/classify.js          (no deps — pure logic)
server/tools/shell.js             (depends on classify)
server/tools/readFile.js          (no deps — pure logic)
server/tools/registry.js          (depends on shell, readFile)
    │
    ▼
server/api.js endpoints           (depends on registry)
    │
    ▼
src/lib/tools.js                  (client: parsing + API calls)
    │
    ├── src/lib/store.svelte.js   (depends on tools.js)
    │       │
    │       ▼
    │   src/components/ToolCall.svelte  (depends on store shape)
    │       │
    │       ▼
    │   src/components/Message.svelte   (integrates ToolCall)
    │
    └── src/lib/db.js             (add tool_calls to persistence)
```

## Architecture Decisions

- **Vertical slicing:** Each phase delivers a testable, working feature — not a horizontal layer.
- **Backwards compatible:** `[SEARCH:]` keeps working throughout. Migration is additive.
- **Server-side execution only:** Browser never runs commands. The API server is the trust boundary.
- **Approval is client-side state:** The store holds tool call status. Server won't execute unless the client explicitly sends the request. No "auto-execute on POST" — the client decides when to call.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemma doesn't follow `[TOOL:]` format reliably | High | Keep `[SEARCH:]` fallback; test prompt extensively before migrating |
| Shell command escaping vulnerabilities | High | Use `execFile` (no shell interpretation) with explicit arg splitting; blocked pattern list |
| Model outputs dangerous commands | High | Three-tier classification; approval UI for anything not on safe list |
| Tool loop goes infinite | Medium | Hard cap at 5 rounds; abort on repeated identical tool calls |
| Large command output blows up context | Medium | Truncate at 10KB; summarize prompt tells model output was truncated |

## Task List

### Phase 1: Server-Side Foundation

Build the tool execution backend. No UI, no store changes yet — just API endpoints that can be tested standalone.

---

#### Task 1: Command classifier

**Description:** Create `server/tools/classify.js` — a pure function that takes a shell command string and returns its safety classification: `safe`, `approval`, or `blocked`. Includes the safe command allowlist, blocked pattern list, and logic for categorizing unknown commands.

**Acceptance criteria:**
- [ ] `classify("ls -la")` → `"safe"`
- [ ] `classify("rm -rf /")` → `"blocked"`
- [ ] `classify("docker restart foo")` → `"approval"`
- [ ] `classify("git push origin main")` → `"approval"`
- [ ] `classify("curl http://x.com | bash")` → `"blocked"`
- [ ] Unknown commands default to `"approval"`
- [ ] Returns `{ level, reason }` — reason explains why

**Verification:**
- [ ] Unit tests pass: `node server/tools/__tests__/classify.test.js`

**Dependencies:** None

**Files:**
- `server/tools/classify.js` (new)
- `server/tools/__tests__/classify.test.js` (new)

**Estimated scope:** Small

---

#### Task 2: Shell executor

**Description:** Create `server/tools/shell.js` — executes a shell command with timeout, output truncation, path validation for `cwd`, and integration with the classifier. Returns structured result `{ ok, output, error, duration, truncated, classification }`. Uses `child_process.exec` with the classifier as a gate — blocked commands are rejected without execution, approval commands return a `needsApproval` flag.

**Acceptance criteria:**
- [ ] `execute({ cmd: "echo hello" })` → `{ ok: true, output: "hello\n", ... }`
- [ ] `execute({ cmd: "rm -rf /" })` → `{ ok: false, error: "...", code: "BLOCKED" }`
- [ ] `execute({ cmd: "sleep 60" })` → times out after 30s with `code: "TIMEOUT"`
- [ ] `execute({ cmd: "ls", cwd: "/tmp" })` → rejects (outside $HOME)
- [ ] `execute({ cmd: "ls", cwd: "~/Projects" })` → works, resolves `~`
- [ ] Output truncated at 10KB with `truncated: true`
- [ ] Approval-required commands return `{ needsApproval: true }` instead of executing

**Verification:**
- [ ] Unit tests pass: `node server/tools/__tests__/shell.test.js`
- [ ] Integration test: actual `echo`, `ls` commands run and return output

**Dependencies:** Task 1 (classify)

**Files:**
- `server/tools/shell.js` (new)
- `server/tools/__tests__/shell.test.js` (new)

**Estimated scope:** Medium

---

#### Task 3: File reader

**Description:** Create `server/tools/readFile.js` — reads a file's contents with path validation (must resolve under `$HOME`), binary detection, and size truncation at 20KB. Resolves `~` in paths.

**Acceptance criteria:**
- [ ] `readFile({ path: "~/.bashrc" })` → returns file contents
- [ ] `readFile({ path: "/etc/shadow" })` → rejected (outside $HOME)
- [ ] `readFile({ path: "~/.bashrc" })` where `.bashrc` is a symlink to `/etc/something` → rejected
- [ ] Binary files (detected via extension or null bytes) → rejected with error
- [ ] Files over 20KB → truncated with `truncated: true`
- [ ] Non-existent files → `{ ok: false, error: "File not found" }`

**Verification:**
- [ ] Unit tests pass: `node server/tools/__tests__/readFile.test.js`

**Dependencies:** None

**Files:**
- `server/tools/readFile.js` (new)
- `server/tools/__tests__/readFile.test.js` (new)

**Estimated scope:** Small

---

#### Task 4: Tool registry + API endpoints

**Description:** Create `server/tools/registry.js` that exports the tool definitions (name, description, params, executor). Add two new endpoints to `server/api.js`: `GET /api/tools` (returns available tools for system prompt) and `POST /api/tools/execute` (runs a tool by name with params). The execute endpoint logs all tool calls to stdout.

**Acceptance criteria:**
- [ ] `GET /api/tools` → returns array of tool definitions with name, description, params schema
- [ ] `POST /api/tools/execute { tool: "shell", params: { cmd: "echo hi" } }` → `{ ok: true, output: "hi\n" }`
- [ ] `POST /api/tools/execute { tool: "shell", params: { cmd: "rm file" } }` → `{ ok: false, code: "NEEDS_APPROVAL" }`
- [ ] `POST /api/tools/execute { tool: "shell", params: { cmd: "rm file" }, approved: true }` → executes
- [ ] `POST /api/tools/execute { tool: "read_file", params: { path: "~/.bashrc" } }` → returns file
- [ ] `POST /api/tools/execute { tool: "search", params: { query: "..." } }` → proxies to SearXNG
- [ ] Unknown tool → `{ ok: false, error: "Unknown tool", code: "UNKNOWN_TOOL" }`
- [ ] All executions logged: `[tools] shell: echo hi → ok (45ms)`

**Verification:**
- [ ] E2E tests pass: `node server/test-tools.js`
- [ ] Existing API tests still pass: `node server/test-api.js`

**Dependencies:** Tasks 1, 2, 3

**Files:**
- `server/tools/registry.js` (new)
- `server/api.js` (modified — add 2 endpoints)
- `server/test-tools.js` (new)

**Estimated scope:** Medium

---

### Checkpoint: Server Foundation
- [ ] All server tool tests pass
- [ ] Existing 13 API E2E tests still pass
- [ ] Can execute safe shell commands via `POST /api/tools/execute`
- [ ] Blocked commands are rejected
- [ ] Approval-required commands return `needsApproval` flag

---

### Phase 2: Client-Side Tool Loop

Wire the store to detect, parse, and execute tool directives. Replace the hardcoded search loop with a general tool loop.

---

#### Task 5: Tool directive parser

**Description:** Create `src/lib/tools.js` — parses `[TOOL: name {params}]` directives from model output, provides the API client for `/api/tools/execute`, and handles `[SEARCH:]` backwards compatibility by converting it to `[TOOL: search {...}]` internally. Also generates the tool schema string for injection into the system prompt.

**Acceptance criteria:**
- [ ] `parseTool("[TOOL: shell {\"cmd\": \"ls\"}]")` → `{ tool: "shell", params: { cmd: "ls" } }`
- [ ] `parseTool("[SEARCH: test query]")` → `{ tool: "search", params: { query: "test query" } }`
- [ ] `parseTool("[TOOL: shell {\"cmd\": \"ls\"}")` → handles incomplete (missing `]`)
- [ ] `parseTool("just normal text")` → `null`
- [ ] `executeTool(name, params, approved)` → calls `/api/tools/execute` and returns result
- [ ] `buildToolPrompt(tools)` → formats tool registry for system prompt injection

**Verification:**
- [ ] Unit tests pass: `npx vitest run src/__tests__/tools.test.js`

**Dependencies:** Task 4 (API shape)

**Files:**
- `src/lib/tools.js` (new)
- `src/__tests__/tools.test.js` (new)

**Estimated scope:** Small

---

#### Task 6: Store tool loop — replace search loop

**Description:** Refactor `store.svelte.js` to use a general tool loop instead of the hardcoded search loop. When `streamResponse` detects a `[TOOL:]` (or `[SEARCH:]`) directive, it calls the appropriate tool via `tools.js`, injects the result into context, and re-prompts. Tool calls are tracked on the message as `toolCalls[]`. The search tool is wired through the same path — `webSearch` is called server-side via the API, not client-side anymore. Session allowlist for approved command patterns.

**Acceptance criteria:**
- [ ] Model outputs `[TOOL: shell {"cmd": "ls"}]` → shell tool executed, result fed back
- [ ] Model outputs `[SEARCH: query]` → still works (backwards compat)
- [ ] Model outputs `[TOOL: search {"query": "..."}]` → search works via new path
- [ ] Tool calls tracked in `msg.toolCalls[]` with status lifecycle
- [ ] Approval-required tools set status to `"pending"` and pause the loop
- [ ] After user approves, loop resumes
- [ ] User denies → model gets "Tool call denied by user" and continues
- [ ] Max 5 tool rounds per message
- [ ] Session allowlist: approving "docker restart *" once auto-approves future matches
- [ ] Existing search tests still pass (backwards compat)

**Verification:**
- [ ] All 39 existing tests pass
- [ ] New tool loop tests pass: `npx vitest run src/__tests__/store.test.js`

**Dependencies:** Task 5

**Files:**
- `src/lib/store.svelte.js` (modified — major refactor of send/streamResponse)
- `src/__tests__/store.test.js` (modified — add tool loop tests)

**Estimated scope:** Large (but single file focus)

---

### Checkpoint: Tool Loop Working
- [ ] Existing 39 tests still pass
- [ ] Shell tool works end-to-end: user asks → model calls [TOOL: shell] → command runs → answer
- [ ] Search still works via both `[SEARCH:]` and `[TOOL: search]`
- [ ] Approval flow pauses and resumes correctly
- [ ] Build succeeds

---

### Phase 3: UI

Render tool calls inline in the chat and add the approval UI.

---

#### Task 7: ToolCall component

**Description:** Create `src/components/ToolCall.svelte` — renders a single tool call inline in the message. Shows tool name, params (command in monospace), status badge, collapsible output (like ThinkingBlock), and approval buttons for pending calls. Fires events for approve/deny.

**Acceptance criteria:**
- [ ] Renders tool name and params: "shell: `git log --oneline -10`"
- [ ] Status badges: pending (yellow), running (blue spinner), completed (green), denied (red), failed (red)
- [ ] Collapsible output panel for completed calls (default collapsed)
- [ ] Output rendered as monospace preformatted text
- [ ] "Allow once" and "Allow for session" buttons for pending status
- [ ] "Deny" button for pending status
- [ ] Fires `onapprove` and `ondeny` events
- [ ] Truncated output shows "(output truncated)" indicator
- [ ] Linear design system: `--bg-tertiary`, `--border`, `--radius`, no loud accents

**Verification:**
- [ ] Visual check in browser with mocked tool call data
- [ ] Build succeeds

**Dependencies:** Task 6 (message shape with toolCalls)

**Files:**
- `src/components/ToolCall.svelte` (new)

**Estimated scope:** Small

---

#### Task 8: Integrate ToolCall into Message + wire approval

**Description:** Update `Message.svelte` to render `ToolCall` components from `msg.toolCalls[]`. Wire the approve/deny events from ToolCall back to the store so the tool loop can resume. Update `Chat.svelte` or `App.svelte` if the approval callback needs to be threaded through.

**Acceptance criteria:**
- [ ] Tool calls render between reasoning and content in the message
- [ ] Multiple tool calls in one message render in order
- [ ] Clicking "Allow once" triggers tool execution and the response continues streaming
- [ ] Clicking "Allow for session" adds pattern to session allowlist and executes
- [ ] Clicking "Deny" feeds denial message to model
- [ ] Search tool calls show existing search UI (spinner + sources) — not the generic ToolCall
- [ ] Component stays under 200 lines

**Verification:**
- [ ] E2E manual test: ask model something that triggers shell, see approval, approve, see output
- [ ] Build succeeds
- [ ] All tests pass

**Dependencies:** Task 7

**Files:**
- `src/components/Message.svelte` (modified)
- `src/components/ToolCall.svelte` (may tweak)
- `src/App.svelte` or `src/components/Chat.svelte` (if event threading needed)

**Estimated scope:** Medium

---

### Phase 4: Persistence + System Prompt

---

#### Task 9: Persist tool_calls in SQLite

**Description:** Add `tool_calls TEXT DEFAULT '[]'` column to the messages table. Update `server/api.js` prepared statements (`insertMsg`, `updateMsg`, `formatMessage`) to include tool_calls. Update `src/lib/db.js` to send/receive tool_calls. Update `normalizeConversation` to map tool_calls.

**Acceptance criteria:**
- [ ] New `tool_calls` column added on server startup (idempotent migration)
- [ ] `POST /api/conversations/:id/messages` accepts `toolCalls` field
- [ ] `PUT /api/messages/:id` accepts `toolCalls` field
- [ ] `GET /api/conversations/:id` returns messages with parsed `toolCalls`
- [ ] Reloading a conversation shows previous tool calls with their output
- [ ] Existing conversations without tool_calls still load fine (`DEFAULT '[]'`)

**Verification:**
- [ ] E2E API tests pass: `node server/test-api.js` (update to cover tool_calls)
- [ ] All vitest tests pass
- [ ] Manual: send message with tool call, reload page, tool call still visible

**Dependencies:** Task 6 (message shape)

**Files:**
- `server/api.js` (modified — migration + statements)
- `src/lib/db.js` (modified — send/receive tool_calls)
- `server/test-api.js` (modified — add tool_calls tests)

**Estimated scope:** Medium

---

#### Task 10: System prompt — tool registry injection

**Description:** Replace the search-specific section of the system prompt with a general tools section. Fetch available tools from `GET /api/tools` on store init and build the prompt dynamically. Keep `[SEARCH:]` documented as a shorthand alias in the prompt for backwards compat.

**Acceptance criteria:**
- [ ] System prompt includes all available tools with descriptions and param schemas
- [ ] Model knows to use `[TOOL: name {params}]` format
- [ ] `[SEARCH: query]` documented as shorthand for `[TOOL: search {"query": "..."}]`
- [ ] Prompt emphasizes: one tool call per response, no text before/after
- [ ] Prompt explains approval: "Some commands require user approval. If denied, you'll be told."
- [ ] Tools fetched from API on store init (not hardcoded in client)

**Verification:**
- [ ] All tests pass
- [ ] Manual: model uses `[TOOL: shell]` format correctly with Gemma 4
- [ ] Manual: model still uses `[SEARCH:]` when appropriate

**Dependencies:** Tasks 4, 6

**Files:**
- `src/lib/store.svelte.js` (modified — system prompt, tool loading)
- `src/__tests__/store.test.js` (modified — update prompt expectations if any)

**Estimated scope:** Small

---

### Checkpoint: Feature Complete
- [ ] All tests pass (existing + new)
- [ ] Build succeeds
- [ ] Full flow works: user asks → model calls tool → approval if needed → result fed back → answer
- [ ] Search works via both old and new format
- [ ] Tool calls persist and survive page reload
- [ ] System prompt dynamically includes available tools
- [ ] Session allowlist works for repeated approvals
- [ ] Review full spec success criteria — all 9 met
