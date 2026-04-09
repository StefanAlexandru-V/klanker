# Frontend Architecture

## Overview

Klanker's web frontend is a Svelte 5 chat application with SSE streaming, web search, file/image support, and an LLM-driven tool framework. The architecture follows a unidirectional data flow: reactive store → component tree → user actions → store mutations.

## Component Tree

```
App.svelte
├── Sidebar.svelte
│   ├── SearchBox.svelte
│   └── ConversationItem.svelte (×N)
├── ModelSelector.svelte
├── Chat.svelte
│   └── Message.svelte (×N per conversation)
│       ├── ThinkingBlock.svelte
│       ├── MessageAttachments.svelte
│       ├── ToolCall.svelte (×N per message)
│       └── MessageSources.svelte
└── Input.svelte
    └── FileAttachments.svelte
```

## Data Flow

### Core Architecture

```
User types → Input.svelte → App.send() → store.send()
  → streamChat() yields SSE tokens
  → store mutates $state (conversations array)
  → Chat/Message re-render reactively
```

### State Management

All state lives in `createChatStore()` (`src/lib/store.svelte.js`), a closure returning getters/methods. Key reactive state:

| State | Type | Description |
|-------|------|-------------|
| `conversations` | `$state([])` | All conversations with nested messages |
| `activeConvId` | `$state('')` | Currently selected conversation |
| `loading` | `$state(false)` | Whether a response is streaming |
| `searching` | `$state(false)` | Whether a web search is in progress |
| `models` | `$state([])` | Available LM Studio models |
| `selectedModel` | `$state('')` | Active model ID |

Non-reactive internal state:
- `abortController` — cancels in-flight streams
- `pendingApproval` — promise-based gate for tool approval UI
- `availableTools` — fetched from `/api/tools` on init
- `systemPrompt` — base prompt + dynamic tool section
- `sessionAllowlist` — `Set<string>` of approved command patterns

### Svelte 5 Reactivity

The store uses `$state()` for the conversations array. Svelte 5 creates deep proxies, so nested mutations (e.g., `msg.content = 'text'`, `tc.status = 'running'`) trigger UI updates automatically.

Components consume store state via props passed from `App.svelte`:
```
App.svelte → chat.activeMessages (getter) → Chat.svelte messages prop → Message.svelte
```

## Tool Framework

### Flow: Safe Tool (No Approval)

```
LLM outputs [TOOL: shell {"cmd": "ls"}]
  → streamResponse() detects directive, returns full text
  → parseTool() extracts { tool: 'shell', params: { cmd: 'ls' } }
  → Pre-check: executeToolApi('shell', params, false)
  → Server classifies 'ls' as safe → returns ok
  → executeToolCall() runs it with approved=true
  → Result injected into system prompt
  → LLM re-prompted with tool output
```

### Flow: Tool Requiring Approval

```
LLM outputs [TOOL: shell {"cmd": "npm install express"}]
  → Pre-check returns { code: 'NEEDS_APPROVAL' }
  → isSessionAllowed() checks allowlist → false
  → tc.status = 'pending'
  → UI renders ToolCall.svelte with approve/deny buttons
  → Promise awaits user action
  
User clicks "Allow once":
  ToolCall.svelte → onapprove(false)
    → Message.svelte → onapprove(false)
      → Chat.svelte → onapprove(false)
        → App.svelte → chat.resolveToolApproval(true, false)
          → pendingApproval.resolve(true)
            → tc.status = 'approved' → 'running' → 'completed'
            → Result fed to LLM

User clicks "Allow for session":
  Same flow but forSession=true
  → addToSessionAllowlist() stores the command prefix
  → Future matching commands skip the approval prompt

User clicks "Deny":
  ToolCall.svelte → ondeny()
    → App.svelte → chat.resolveToolApproval(false)
      → tc.status = 'denied'
      → LLM re-prompted with denial context
```

### Flow: Search (Backwards Compatible)

Both `[SEARCH: query]` and `[TOOL: search {"query": "..."}]` are supported. Search executes client-side via SearXNG:

```
parseTool() returns { tool: 'search', params: { query } }
  → executeToolCall() handles search specially
  → webSearch() → SearXNG API → results
  → Sources added to msg.sources (deduped, max 5)
  → formatSearchContext() → injected into system prompt
  → LLM re-prompted with search results
```

### Flow: Blocked Tool

```
Pre-check returns { code: 'BLOCKED' }
  → tc.status = 'failed', tc.error set
  → LLM re-prompted with "tool was blocked" context
  → No approval prompt shown
```

### Tool Call Lifecycle States

```
pending → approved → running → completed
pending → approved → running → failed
pending → denied
pending → (via stopGeneration) → denied
running → completed
running → failed
```

### Session Allowlist

Patterns stored as `"tool:prefix"`:
- **shell**: `shell:{first_two_words}` (e.g., `shell:npm install`)
- **read_file**: `read_file:{directory}` (e.g., `read_file:/home/user/projects`)

Allowlist resets when the page is refreshed (session-scoped, not persisted).

## Persistence

### Save Flow

```
store.persist(conv) → db.saveConversation(conv)
  → PUT /api/conversations/:id (upsert title)
  → For each message:
      If msg._serverId exists:
        PUT /api/messages/:id (update content, reasoning, sources, tool_calls)
      Else:
        POST /api/conversations/:id/messages (create, get back server ID)
        msg._serverId = response.id
```

### Load Flow

```
store.loadFromDb() → db.loadConversations()
  → GET /api/conversations (list all)
  → For each: GET /api/conversations/:id (with messages)
  → normalizeConversation() maps snake_case → camelCase
  → conversations = saved (replaces $state array)
```

### Data Normalization

The server uses `snake_case` (SQLite columns), the client uses `camelCase`. Both the server and `db.js` accept both formats:
- Server: `body.tool_calls || body.toolCalls`
- Client load: `m.tool_calls || m.toolCalls`

## Streaming

### SSE Token Flow

```
streamChat() → async generator yielding { type, text }
  type='reasoning' → appended to msg.reasoning
  type='content'   → appended to fullText buffer

Buffer processing (per token):
  1. Check hasIncompleteDirective() → if true, skip UI update (keep buffering)
  2. Check parseTool() → if complete directive found, skip UI update
  3. Check inThinkBlock → if true, skip UI update (reasoning capture)
  4. Otherwise → msg.content = fullText (triggers reactive UI update)
```

### Thinking-as-Content

Some models (Gemma, Qwen) dump reasoning into content tokens instead of using a dedicated reasoning field. The store handles this:

1. Detects `<think>` tags or `Thought process:` headers
2. Sets `inThinkBlock = true`, suppresses content display
3. After streaming completes, `stripThinking()` extracts reasoning
4. Moves text before `[TOOL:]` directives into `msg.reasoning`
5. `ThinkingBlock.svelte` renders reasoning in a collapsible block

This is a **feature**, not a bug.

## Auto-Scroll Behavior

`Chat.svelte` tracks scroll position:
- `lastContent` — tracks content changes on the last message
- `lastToolCalls` — tracks tool call count changes (triggers scroll when approval buttons appear)
- `userScrolledUp` — disables auto-scroll when user manually scrolls up
- New user messages always force scroll to bottom
- "Scroll to bottom" button appears when scrolled up

## Security Model

### Three-Tier Classification (server/tools/classify.js)

| Tier | Behavior | Examples |
|------|----------|---------|
| **safe** | Auto-execute, no prompt | `ls`, `cat`, `git log`, `grep` |
| **approval** | Needs user click to proceed | `npm install`, `git commit`, `sed`, `awk` |
| **blocked** | Never execute | `rm -rf /`, `sudo su`, `curl | sh` |

### Key Security Decisions

- `sed`, `awk`, `tee`, `xargs`, `env`, `printenv` are not in the safe list — they fall through to the default "approval" classification as unknown commands
- Shell executor restricts `cwd` to `$HOME` tree (note: commands themselves can still access other paths)
- `read_file` validates path is under `$HOME`, resolves symlinks
- Pipe chains: classified by most restrictive segment
- Chain operator check (`&&`, `;`, `||`) runs BEFORE pipe check (`|`) — prevents `||` being split on single `|`
- Git/Docker subcommands: fine-grained (e.g., `git stash list` = safe, bare `git stash` = approval, `git stash pop` = approval)

## Component Responsibilities

| Component | Lines | Responsibility |
|-----------|-------|----------------|
| `App.svelte` | ~130 | Layout, store creation, event wiring, sidebar/responsive |
| `Chat.svelte` | ~100 | Scrollable message list, auto-scroll, scroll-to-bottom |
| `Message.svelte` | ~100 | Message rendering: markdown, citations, tool calls, thinking |
| `ToolCall.svelte` | ~80 | Tool call status, approve/deny buttons, collapsible output |
| `ThinkingBlock.svelte` | ~50 | Collapsible reasoning display |
| `Input.svelte` | ~150 | Textarea, send/stop, drag-and-drop files |
| `Sidebar.svelte` | ~100 | Conversation list shell |
| `ConversationItem.svelte` | ~100 | Single row: click, rename, context menu |
| `ModelSelector.svelte` | ~100 | Dropdown with keyboard nav |

## Known Limitations

1. **Single tool per round** — The tool loop processes one `[TOOL:]` directive per LLM response, then re-prompts. Max 5 rounds.
2. **Tool context as conversation turns** — Each round adds the model's tool directive as an assistant message and the tool result as a user message `[Tool result]: ...`. This gives the model a natural conversation history of what it tried, preventing it from repeating failed attempts.
3. **Approval is global, not per-message** — `onapprove`/`ondeny` are passed to all messages. Only the message with `tc.status === 'pending'` shows buttons, and the sequential tool loop ensures at most one pending tool at a time.
4. **Session allowlist is memory-only** — Resets on page refresh.
5. **`read_file` has 20KB limit** — Large files are truncated.
