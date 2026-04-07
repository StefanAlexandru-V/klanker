# Changelog

## [Unreleased] — Session 2025-07-07

### Fixed (already applied to working tree, NOT yet committed)

#### Security — Critical
- **XSS via `{@html}`** — `src/components/Message.svelte` now imports DOMPurify and sanitizes all `marked.parse()` output before rendering with `{@html}`. Added `dompurify` dependency.
- **`.env` not in `.gitignore`** — Added `.env`, `.env.local`, `.env.*.local` to `.gitignore`. Also added `.gitnexus/`, `entities.json`, `mempalace.yaml` to prevent committing local tooling state.

#### Bugs — Medium
- **SSE buffer memory leak** — `src/lib/api.js:109-116` — When the server sent non-`data:` content (comments, blank lines, preamble), the buffer grew unboundedly because `start` never advanced past non-`data:` text. Fixed by trimming the buffer up to the last newline when no `data:` prefix is found.
- **Auto-scroll broken during streaming** — `src/components/Chat.svelte:16-24` — The `$effect` only tracked `messages.length`, which doesn't change as tokens append to an existing message's `content`. Added a `$derived` on the last message's content so scroll fires on every token.

#### Performance — Low
- **CSV/TSV files loading 425KB xlsx library** — `src/lib/fileParser.js:120-129` — `csv` and `tsv` are in `TEXT_EXTENSIONS` but the xlsx code path ran first, pulling in the heavy library unnecessarily. Reordered: plain text check now runs before xlsx check.

#### Code Quality — Low
- **`marked.parse()` async ambiguity** — `src/components/Message.svelte:27` — Added `async: false` to `marked.setOptions()` to explicitly prevent Promise return values in `$derived`.

### Added
- `dompurify` dependency (`package.json`)

### Infrastructure
- Initialized git repository (branch: `main`)
- Configured GitHub MCP server globally in `~/.config/crush/crush.json` (Docker-based `ghcr.io/github/github-mcp-server`, image already pulled)
- GitHub MCP requires `GITHUB_PERSONAL_ACCESS_TOKEN` env var to be set before use

---

## Audit Findings (not yet addressed)

### Must Fix — Code
| # | Category | File(s) | Issue |
|---|----------|---------|-------|
| 1 | Component size | `Message.svelte` (522 lines) | Split into `MessageContent`, `MessageAttachments`, `MessageSources`, `ThinkingBlock` |
| 2 | Component size | `Input.svelte` (465 lines) | Extract file handling logic and attachment UI into subcomponents |
| 3 | Component size | `Sidebar.svelte` (423 lines) | Extract `ConversationItem`, `ContextMenu`, `SearchBox` subcomponents |
| 4 | Dead code | `db.js` — `clearConversations()` | Exported but never called in production code |
| 5 | Accessibility | `Chat.svelte` | No `aria-live` region for streaming messages |
| 6 | Accessibility | `ModelSelector.svelte` | No arrow-key navigation in dropdown |
| 7 | Responsive | All components | Only 768px breakpoint — missing 320px (small phone) and 1440px (widescreen) |

### Must Fix — Design
| # | Issue | Action |
|---|-------|--------|
| 8 | Apply Linear design system | Replace current CSS custom properties in `app.css` with Linear tokens (see PROGRESS.md for full spec) |
| 9 | Adopt Inter Variable font | Replace Roboto with Inter Variable (`cv01`, `ss03` features), weight 510 default |
| 10 | Semi-transparent borders | Replace opaque `#1a1a1a` borders with `rgba(255,255,255,0.05-0.08)` |
| 11 | Soften backgrounds | Replace `#000000` with `#08090a`, add luminance layering for sidebar/main/elevated surfaces |

### Should Fix — Docs
| # | Issue |
|---|-------|
| 12 | `SPEC.md` is stale — references `store.js`, claims no dependencies |
| 13 | `README.md` is default Vite template — needs real project documentation |

### Known Vulnerability (no fix available)
- `xlsx@0.18.5` — Prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9). Consider replacing with `exceljs` or SheetJS CE.
