# Changelog

## [0.3.0] — 2026-04-07

### Fixed — UI Layout
- **Chat window centered weirdly** — Removed `max-width: 1200px` centering on `.main` at 1440px that disconnected it from the sidebar. Widened `.message-inner` to 760px (820px on large screens).
- **Navbar menu disappearing** — Menu button was conditionally rendered (`{#if !sidebarOpen}`), causing layout reflow. Now always present with icon swapping (hamburger/sidebar panel).
- **Sidebar DOM removal** — Sidebar used `{#if}` which fully removed DOM on toggle. Now uses CSS `width` transition on a `.sidebar-rail` wrapper for smooth 200ms slide animation.
- **Mobile sidebar broken on first load** — `sidebarOpen` was `true` regardless of screen width. Now detects viewport at init and closes by default on mobile.
- **Auto-scroll during streaming** — Scrolled to bottom on every token even if user scrolled up. Now only auto-scrolls when within 120px of bottom. Added "scroll to bottom" pill button.
- **Missing `@keyframes spin`** — Search spinner in `Message.svelte` referenced undefined animation. Added keyframe.
- **Context menu didn't close on Escape/scroll** — Added keyboard and scroll handlers in `Sidebar.svelte`.
- **Rename input not auto-focused** — Added `$effect` with `focus()` and `select()` in `ConversationItem.svelte`.
- **Textarea stuck at expanded height after send** — Added `$effect` watching `text` to trigger `autoResize()`.
- **ModelSelector keyboard navigation broken** — Dropdown now auto-focuses on open, responds to arrow keys immediately from trigger.

### Fixed — Web Search Flow
- **`[SEARCH:]` text flashing in UI** — `streamResponse` now buffers content when `bufferForSearch: true`, detecting `[SEARCH:]` anywhere in accumulated text before writing to reactive state.
- **Reasoning wiped across search rounds** — Search loop no longer clears `reasoning`. Preserved across all rounds.
- **Object replacement broke reactivity** — Replaced spread-and-reassign with direct mutation on the existing message object.
- **Model reasoning-as-content not detected** — Models that dump chain-of-thought as `content` tokens (not `reasoning_content`) now have that text captured as `msg.reasoning`. `[SEARCH:]` is detected anywhere in the response, not just at the start.
- **Malformed `[SEARCH:` without closing bracket** — Buffer now tracks the last `[SEARCH:` occurrence and waits for `]` before deciding whether to suppress.
- **Duplicate sources across search rounds** — Sources are now deduplicated by URL before appending.

### Fixed — SearXNG Integration
- **SearXNG returning 403 on JSON requests** — `formats` config in `settings.yml` only allowed `html`. Added `json` to allowed formats list.

### Changed — System Prompt
- Added `# Vision` section — tells model it CAN see images, prevents "I cannot view images" responses.
- Simplified search instructions — "your ENTIRE response must be exactly one line", removed conflicting guidance about image search.
- Added "links, resources, recommendations" to search triggers.
- Removed "you cannot search for images" (SearXNG can find image gallery pages).

### Added — Citation Styling
- Inline `[1]`, `[2]` citations in assistant messages now render as styled superscript badges — `--bg-tertiary` background, `--border-light` border, mono font, linking to source URL. Matches Linear design system.

### Added — Tests
- `preserves reasoning across search rounds` — verifies reasoning from `reasoning_content` tokens survives search loop.
- `does not flash [SEARCH:] text in content during buffered streaming` — polls `msg.content` during async send to verify no search directive leaks.
- `handles multiple search rounds accumulating sources` — verifies multi-round search with source dedup.
- `handles model dumping reasoning as content tokens before [SEARCH:]` — the Qwen scenario where chain-of-thought is in content tokens.
- `handles model reasoning-as-content across multiple search rounds` — multi-round variant.

## [0.2.0] — 2026-04-07

### Refactored — Component Decomposition
- **Message.svelte** (522 → 311 lines) — Extracted `ThinkingBlock.svelte`, `MessageAttachments.svelte`, `MessageSources.svelte`
- **Input.svelte** (465 → 303 lines) — Extracted `FileAttachments.svelte` and `src/lib/fileHandler.js`
- **Sidebar.svelte** (423 → 185 lines) — Extracted `ConversationItem.svelte` and `SearchBox.svelte`

### Changed — Design System
- **Linear design system** applied to `app.css` — replaced Roboto with Inter Variable, opaque borders with semi-transparent `rgba()`, `#000` with `#08090a` luminance-stacked backgrounds, white accent with indigo `#5e6ad2`
- **Font features**: `cv01`, `ss03`, weight 510, `+0.2px` letter-spacing for dark-mode readability
- **Selection color** changed from white to indigo tint

### Added — Accessibility
- `aria-live="polite"` on streaming message container in `Chat.svelte`
- Arrow-key navigation in `ModelSelector.svelte` dropdown
- Skip-to-content link in `App.svelte`
- ARIA `role="option"` and `aria-selected` on model dropdown items

### Added — Responsive
- `@media (max-width: 320px)` breakpoint — tighter padding, smaller fonts
- `@media (min-width: 1440px)` breakpoint — constrained max-width

### Removed
- Dead code: `clearConversations()` from `db.js` and its mock in `store.test.js`

### Docs
- Rewrote `SPEC.md` to v2.0 reflecting actual architecture
- Rewrote `README.md` with setup instructions, architecture overview, env vars
- Updated `AGENTS.md` architecture diagram to match new component tree

## [0.1.0] — 2026-04-07

### Fixed — Security
- **XSS via `{@html}`** — DOMPurify sanitizes all `marked.parse()` output before rendering.
- **`.env` not in `.gitignore`** — Added `.env`, `.env.local`, `.env.*.local`.

### Fixed — Bugs
- **SSE buffer memory leak** — Buffer now trims past non-`data:` text.
- **Auto-scroll broken during streaming** — Added `$derived` on last message content.
- **CSV/TSV loading xlsx library** — Reordered text check before xlsx check.
- **`marked.parse()` async ambiguity** — Added `async: false` to options.

### Infrastructure
- Initialized git repository, initial commit pushed to `main`
