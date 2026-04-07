# AGENTS.md

## Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Run all tests | `npm test` |
| Watch tests | `npm run test:watch` |
| Run single test file | `npx vitest run src/__tests__/api.test.js` |

## Architecture

Svelte 5 + Vite chat app that streams responses from an LM Studio OpenAI-compatible API via SSE.

```
src/
  main.js                  # Mounts App into #app
  App.svelte               # Root layout: header, error bar, Chat, Input
  app.css                  # Global styles, CSS custom properties, dark theme
  lib/
    api.js                 # streamChat() async generator — SSE streaming client
    store.svelte.js        # createChatStore() — reactive state via Svelte 5 runes
  components/
    Chat.svelte            # Scrollable message list with auto-scroll and typing indicator
    Message.svelte          # Single message bubble (user right, assistant left)
    Input.svelte            # Textarea + send button, Enter/Shift+Enter handling
  __tests__/
    api.test.js            # streamChat tests with mocked fetch/ReadableStream
    store.test.js          # Store integration test with mocked API
```

**Data flow:** `Input` → `App.send()` → `store.send()` → `streamChat()` yields tokens → store mutates `$state` → `Chat`/`Message` re-render reactively.

## Key Conventions

- **No TypeScript** — plain JS with JSDoc comments for type hints.
- **Svelte 5 runes** (`$state`, `$effect`, `$props`) — no legacy `$:` reactivity or stores.
- Store file uses `.svelte.js` extension so Vite compiles runes outside `.svelte` files.
- **No UI libraries** — all styling is plain CSS with scoped `<style>` blocks per component.
- All colors/spacing use CSS custom properties defined in `app.css`.
- Components target < 100 lines each.
- All API logic isolated in `src/lib/api.js`; components never call `fetch` directly.

## Environment Variables

Configured in `.env`, prefixed with `VITE_` for client-side access:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE` | `http://10.3.58.20:1234/v1` | LM Studio API base URL |
| `VITE_MODEL_ID` | `qwen/qwen2.5-coder-14b` | Model identifier |
| `VITE_SYSTEM_PROMPT` | `You are a helpful assistant.` | System prompt prepended to all requests |

## Testing

- **Vitest** with node environment — no DOM/browser needed for current tests.
- `api.test.js` mocks `fetch` with `vi.stubGlobal` and constructs `ReadableStream` to simulate SSE chunks.
- `store.test.js` mocks `../lib/api.js` module to isolate store logic from network.
- Svelte plugin processes `.svelte.js` files during test runs, so runes work in tests.

## Gotchas

- The store file **must** be `.svelte.js` (not `.js`) — `$state` and other runes are compile-time transforms that only activate for `.svelte` and `.svelte.js` files.
- SSE parsing in `api.js` handles chunks split across `ReadableStream` reads by buffering incomplete lines — don't assume one read = one SSE event.
- `streamChat` is an **async generator** — consumers must use `for await...of` and handle `AbortError` for cancellation.
- The store sends the full conversation history (including system prompt) on every request — there is no server-side session.

## MemPalace — Persistent Memory

This project has a MemPalace wing named **klanker** (275 drawers across rooms: src, general, searxng).

### On Session Start

- Run `mempalace_search` or `mempalace_kg_query` before answering questions about past decisions, architecture choices, or project history.
- Use `mempalace_diary_read({agent_name: "crush"})` to recall what happened in previous sessions.

### During Work

- When you discover something important (a decision, a gotcha, a pattern), file it with `mempalace_add_drawer({wing: "klanker", room: "<appropriate_room>", content: "<verbatim content>"})`.
- When facts change (e.g., a dependency is swapped, an API endpoint moves), update the knowledge graph with `mempalace_kg_invalidate` + `mempalace_kg_add`.

### On Session End

- Write a diary entry with `mempalace_diary_write({agent_name: "crush", entry: "<AAAK compressed summary>"})` summarizing what you worked on and what matters.

### Rooms

| Room | Contents |
|------|----------|
| `src` | Source code fragments, store logic, API layer, components |
| `general` | Config, docs, specs, project-level files |
| `searxng` | SearXNG search engine configuration |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **klanker** (113 symbols, 200 relationships, 10 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/klanker/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/klanker/context` | Codebase overview, check index freshness |
| `gitnexus://repo/klanker/clusters` | All functional areas |
| `gitnexus://repo/klanker/processes` | All execution flows |
| `gitnexus://repo/klanker/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
