# Local AI Chatbot — Spec v2.0

## Stack
- Svelte 5 + Vite
- No UI component libraries — plain CSS with scoped `<style>` blocks
- LM Studio OpenAI-compatible API (configurable via env var)
- IndexedDB for persistent conversation storage (via `idb`)

## Project Structure
```
src/
  lib/
    api.js            # streamChat() async generator — SSE streaming client
    store.svelte.js   # createChatStore() — reactive state via Svelte 5 runes
    db.js             # IndexedDB wrapper for conversation persistence
    fileParser.js     # Text extraction from various file types (PDF, DOCX, XLSX, etc.)
    fileHandler.js    # File processing pipeline (image/document handling)
    search.js         # Web search integration via SearXNG
  components/
    Chat.svelte             # Scrollable message list with auto-scroll
    Message.svelte          # Message bubble orchestrator (markdown + content)
    MessageAttachments.svelte  # Image and file attachment display
    MessageSources.svelte   # Web search source citations
    ThinkingBlock.svelte    # Collapsible reasoning/thought display
    Input.svelte            # Textarea + send/stop buttons + drag-and-drop
    FileAttachments.svelte  # Pending file/image attachment UI
    Sidebar.svelte          # Conversation list layout shell
    ConversationItem.svelte # Single conversation row with context menu
    SearchBox.svelte        # Search input with clear button
    ModelSelector.svelte    # Model dropdown with keyboard navigation
  __tests__/
    api.test.js       # streamChat tests with mocked fetch/ReadableStream
    store.test.js     # Store integration tests with mocked API/DB
  App.svelte          # Root layout: sidebar, header, chat, input
  app.css             # Global styles — Linear design system tokens
  main.js             # Entry point — mounts App into #app
```

## Features
- Multi-conversation chat with persistent storage
- Streaming token-by-token display via SSE
- File attachment support (images, PDFs, DOCX, XLSX, plain text, code files)
- Web search integration via SearXNG with source citations
- Model reasoning/thinking display with collapsible block
- Model selector with live model list from LM Studio
- Sidebar with conversation search, rename, and delete
- Loading indicator and typing dots during generation
- Error state with dismissible banner
- Auto-scroll to latest message during streaming
- Enter to send, Shift+Enter for newline
- Drag-and-drop file upload
- Skip-to-content accessibility link

## API
- Endpoint: `POST /v1/chat/completions`
- Model: configurable via `VITE_MODEL_ID` env var
- Streaming: `stream: true` (SSE)
- System prompt: configurable via `VITE_SYSTEM_PROMPT`
- Full conversation history sent on every request (no server-side session)

## Design System
- **Linear-inspired** dark theme with luminance stacking
- **Inter Variable** font with `cv01`, `ss03` features
- `font-weight: 510`, `letter-spacing: 0.2px` for dark-mode readability
- Semi-transparent borders (`rgba(255,255,255,0.05-0.08)`)
- Indigo accent (`#5e6ad2`) with hover variant
- CSS custom properties for all colors, spacing, and typography
- Three responsive breakpoints: 320px, 768px, 1440px

## Environment Variables
```
VITE_API_BASE=http://10.3.58.20:1234/v1
VITE_MODEL_ID=qwen/qwen2.5-coder-14b
VITE_SYSTEM_PROMPT=You are a helpful assistant.
```

## Dependencies
- `svelte` + `@sveltejs/vite-plugin-svelte` — framework + Vite integration
- `marked` — Markdown → HTML rendering
- `dompurify` — HTML sanitization (XSS protection)
- `idb` — IndexedDB promise wrapper
- `pdfjs-dist` — PDF text extraction
- `mammoth` — DOCX text extraction
- `xlsx` — Excel/ODS/CSV parsing

## Code Standards
- No TypeScript — plain JS with JSDoc comments
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) — no legacy stores
- Store file uses `.svelte.js` extension for rune compilation
- Components target < 200 lines each
- All API logic isolated in `src/lib/api.js`
- All file processing in `src/lib/fileHandler.js` + `src/lib/fileParser.js`
- WCAG 2.1 AA accessibility standards

## Testing
- Vitest with node environment
- `api.test.js` — mocked fetch with ReadableStream for SSE simulation
- `store.test.js` — mocked API + DB modules for store logic isolation
- No E2E for now
