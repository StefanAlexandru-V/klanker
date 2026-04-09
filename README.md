# Klanker

Local AI chat application with tool framework, built with Svelte 5 and Vite. Connects to an LM Studio instance via OpenAI-compatible API with real-time streaming. Includes a companion Python voice assistant.

## Features

- **Streaming responses** — token-by-token display via Server-Sent Events
- **Multi-conversation** — persistent chat history with SQLite (shared with voice app)
- **Tool framework** — LLM can execute shell commands, read files, and search the web
- **File attachments** — drag-and-drop support for images, PDFs, DOCX, Excel, code files
- **Web search** — SearXNG integration with source citations
- **Model reasoning** — collapsible thinking/reasoning display
- **Model selection** — live model list from LM Studio with keyboard navigation
- **Voice assistant** — Python companion app with wake word, STT, and floating widget

## Quick Start

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your LM Studio API address

# Start both dev server and SQLite API
npm run dev:full
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `http://10.3.58.20:1234/v1` | LM Studio API base URL |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run api` | Start SQLite API server |
| `npm run dev:full` | Start both (dev + API) |
| `npm run build` | Production build |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |

## Architecture

```
src/
  lib/           # API client, state management, file processing, search, tools
  components/    # Svelte 5 components (< 200 lines each)
  App.svelte     # Root layout
  app.css        # Linear-inspired design system tokens
server/
  api.js         # Node.js SQLite API server (better-sqlite3)
  tools/         # Tool framework: classify, shell, readFile, registry
```

**Data flow:** `Input` → `App.send()` → `store.send()` → `streamChat()` yields tokens → store mutates `$state` → `Chat`/`Message` re-render reactively.

**Tool flow:** Model outputs `[TOOL: name {params}]` → parsed → classified → approved if needed → executed → result fed back → model answers.

## Design

Linear-inspired dark theme with Inter Variable font. Semi-transparent borders, indigo accent, luminance-stacked backgrounds. Responsive at 320px, 768px, and 1440px breakpoints.

## Tech Stack

- **Svelte 5** — runes-based reactivity (`$state`, `$derived`, `$effect`)
- **Vite** — build tooling with HMR
- **Vitest** — unit testing
- **better-sqlite3** — SQLite persistence via API server
- **marked** + **DOMPurify** — safe Markdown rendering
- **pdfjs-dist** / **mammoth** / **xlsx** — file text extraction

## License

Private
