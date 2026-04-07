# Progress — Klanker Audit & Fixes

> Handoff document for the next Crush session. Read this before doing anything.

## Current State

- **Git repo initialized** on `main` branch, NO commits yet, all files staged except `.env` and local tooling.
- **GitHub remote NOT created yet** — waiting for `GITHUB_PERSONAL_ACCESS_TOKEN` to be exported. Target: `StefanAlexandru-V/klanker` (public repo).
- **GitHub MCP configured** in `~/.config/crush/crush.json` using Docker (`ghcr.io/github/github-mcp-server`, image already pulled). Once the token env var is set and Crush is restarted, GitHub MCP tools will be available.
- **5 code fixes already applied** to working tree (see CHANGELOG.md for details). Tests pass (30/30), build succeeds.
- **`dompurify` installed** as a dependency.

## What To Do Next (in order)

### Phase 0: Git + GitHub Setup
1. Confirm `GITHUB_PERSONAL_ACCESS_TOKEN` is exported
2. Use GitHub MCP to create repo `StefanAlexandru-V/klanker` (public, description: "Local AI chat app — Svelte 5 + Vite + LM Studio")
3. Add remote: `git remote add origin git@github.com:StefanAlexandru-V/klanker.git`
4. Commit the current working tree as the initial commit (everything already staged minus `.env` and tooling files)
5. Push to `main`

### Phase 1: Security & Bug Fixes (already applied — just commit)
Commit the 5 fixes that are already in the working tree as atomic commits:

```
chore: add .env and local tooling to .gitignore
fix: sanitize marked HTML output with DOMPurify (XSS)
fix: prevent SSE buffer memory leak on non-data chunks
fix: auto-scroll chat during streaming token updates
perf: route csv/tsv through plain text reader instead of xlsx
```

**Approach:** The initial commit should be the codebase BEFORE these fixes (the original state). Then apply the fixes as separate commits on top. However, since the working tree already has the fixes applied, the simplest path is:
- Initial commit = current state (fixes included)
- OR use `git stash`, commit clean, then pop and commit fixes individually

**Recommended:** Just commit the current state as `chore: initial commit` — then proceed with the remaining work. The fix history is documented in CHANGELOG.md.

### Phase 2: Component Decomposition (new work)
Split oversized components per the frontend-ui-engineering skill (200-line max):

**Message.svelte (522 → ~150 + subcomponents):**
- Extract `src/components/ThinkingBlock.svelte` — collapsible reasoning display
- Extract `src/components/MessageAttachments.svelte` — file chips + image attachments
- Extract `src/components/MessageSources.svelte` — sources list with citation chips
- Keep `Message.svelte` as the orchestrator with markdown rendering + content display

**Input.svelte (465 → ~150 + subcomponents):**
- Extract `src/components/FileAttachments.svelte` — pending files/images display with remove buttons
- Extract file processing logic into `src/lib/fileHandler.js` — `processFiles()`, `readAsDataUrl()`, size formatting
- Keep `Input.svelte` as the form with textarea + send/stop buttons

**Sidebar.svelte (423 → ~150 + subcomponents):**
- Extract `src/components/ConversationItem.svelte` — single conversation row with rename/context menu
- Extract `src/components/SearchBox.svelte` — search input with clear button
- Keep `Sidebar.svelte` as the layout shell

**After each split:** run `npm test && npm run build` to verify. Commit each component split separately.

### Phase 3: Linear Design System
Apply the Linear design system tokens to `src/app.css`. Full spec:

```css
:root {
  /* Backgrounds — luminance stacking */
  --bg-primary: #08090a;        /* was #000000 */
  --bg-secondary: #0f1011;      /* was #0a0a0a — sidebar */
  --bg-tertiary: #191a1b;       /* was #111111 — elevated surfaces */
  --bg-hover: #28282c;          /* was #1a1a1a */

  /* Text */
  --text-primary: #f7f8f8;      /* was #ededed — NOT pure white */
  --text-secondary: #d0d6e0;    /* was #999999 — silver */
  --text-tertiary: #8a8f98;     /* was #666666 */
  --text-on-accent: #ffffff;    /* was #000000 */

  /* Borders — semi-transparent, not opaque */
  --border: rgba(255, 255, 255, 0.05);       /* was #1a1a1a */
  --border-light: rgba(255, 255, 255, 0.08); /* was #2a2a2a */

  /* Accent — Linear indigo instead of white */
  --accent: #5e6ad2;
  --accent-hover: #7170ff;

  /* Semantic colors (from Raycast hybrid) */
  --error: #ff4444;             /* keep */
  --error-bg: rgba(255, 68, 68, 0.08); /* keep */
  --success: #00d47b;           /* keep */

  /* Typography — Inter Variable */
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Berkeley Mono', 'SF Mono', 'Fira Code', monospace;

  /* Depth */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

/* Font features — apply globally */
body {
  font-feature-settings: "cv01", "ss03";
  font-weight: 510;
  letter-spacing: 0.2px;  /* Raycast trick for dark-mode readability */
}
```

Also replace the Google Fonts import in `app.css` line 1:
```css
/* Remove: @import url('https://fonts.googleapis.com/css2?family=Roboto...'); */
/* Replace with Inter from bunny.net (privacy-respecting CDN) or self-host */
@import url('https://fonts.bunny.net/css?family=inter:400,500,510,600');
```

**Note:** `--text-on-accent` changes from black to white because the accent is now dark indigo, not white. Verify all button text using `--text-on-accent` still has sufficient contrast.

### Phase 4: Responsive & Accessibility
- Add `@media (max-width: 320px)` rules — tighter padding, smaller fonts
- Add `@media (min-width: 1440px)` rules — constrain max-width, center content
- Add `aria-live="polite"` to the streaming message container in `Chat.svelte`
- Add arrow-key navigation to `ModelSelector.svelte` dropdown
- Add skip-to-content link in `App.svelte`

### Phase 5: Cleanup & Docs
- Remove `clearConversations()` from `db.js` and its mock in `store.test.js`
- Update `SPEC.md` to reflect actual architecture (store.svelte.js, 5 dependencies, search, file parsing, etc.)
- Write real `README.md` with setup instructions, architecture, env vars

### Phase 6: Final Verification
- `npm test` — all tests pass
- `npm run build` — build succeeds, check bundle sizes
- `npm audit` — document any remaining issues
- Remove this PROGRESS.md file (it's a handoff doc, not permanent)

## Skills To Use

| Phase | Skill |
|-------|-------|
| Phase 0 | `git-workflow-and-versioning` — atomic commits, descriptive messages |
| Phase 1 | `incremental-implementation` — commit each fix separately |
| Phase 2 | `frontend-ui-engineering` — component decomposition, 200-line max |
| Phase 3 | `design-reference` — Linear design system from `awesome-design-md/design-md/linear.app/DESIGN.md` |
| Phase 4 | `frontend-ui-engineering` — accessibility, responsive |
| Phase 5 | `code-review-and-quality` — dead code, docs |
| Phase 6 | `security-and-hardening` — final audit |

## Key Decisions Made

1. **Linear design system chosen** over Claude, Cursor, Vercel, Superhuman, Raycast — it's dark-mode-native with luminance stacking that maps directly to sidebar/main/input layout zones.
2. **Hybrid approach**: Linear colors + Raycast's `+0.2px` letter-spacing and `font-weight: 510` for dark-mode readability.
3. **DOMPurify over manual sanitization** — standard library, 7KB gzipped, comprehensive XSS protection.
4. **Component splits preserve existing CSS** — subcomponents inherit styles via `:global()` or get their own scoped `<style>` blocks extracted from the parent.
5. **Inter Variable font** replaces Roboto — matches Linear spec, provides `cv01`/`ss03` features.

## Files Modified So Far

```
MODIFIED (fixes applied):
  .gitignore              — added .env, .env.local, tooling exclusions
  src/lib/api.js          — SSE buffer leak fix (lines 109-116)
  src/lib/fileParser.js   — reordered text/xlsx checks (lines 120-129)
  src/components/Chat.svelte      — added lastContent derived + void dep
  src/components/Message.svelte   — added DOMPurify import + sanitize + async:false

ADDED:
  CHANGELOG.md            — this changelog
  PROGRESS.md             — this handoff doc
  node_modules/dompurify  — via npm install

CONFIG:
  ~/.config/crush/crush.json — added github MCP server entry

NOT YET COMMITTED — git repo initialized but has 0 commits.
```
