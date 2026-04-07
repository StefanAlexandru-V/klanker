# Klanker

Local AI chat application built with Svelte 5 and Vite. Connects to an LM Studio instance via OpenAI-compatible API with real-time streaming.

## Features

- **Streaming responses** — token-by-token display via Server-Sent Events
- **Multi-conversation** — persistent chat history with IndexedDB
- **File attachments** — drag-and-drop support for images, PDFs, DOCX, Excel, code files
- **Web search** — SearXNG integration with source citations
- **Model reasoning** — collapsible thinking/reasoning display
- **Model selection** — live model list from LM Studio with keyboard navigation

## Quick Start

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your LM Studio API address

# Start development server
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `http://10.3.58.20:1234/v1` | LM Studio API base URL |
| `VITE_MODEL_ID` | `qwen/qwen2.5-coder-14b` | Default model identifier |
| `VITE_SYSTEM_PROMPT` | `You are a helpful assistant.` | System prompt for all conversations |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |

## Architecture

```
src/
  lib/           # API client, state management, file processing, search
  components/    # Svelte 5 components (< 200 lines each)
  App.svelte     # Root layout
  app.css        # Linear-inspired design system tokens
```

**Data flow:** `Input` → `App.send()` → `store.send()` → `streamChat()` yields tokens → store mutates `$state` → `Chat`/`Message` re-render reactively.

## Design

Linear-inspired dark theme with Inter Variable font. Semi-transparent borders, indigo accent, luminance-stacked backgrounds. Responsive at 320px, 768px, and 1440px breakpoints.

## Tech Stack

- **Svelte 5** — runes-based reactivity (`$state`, `$derived`, `$effect`)
- **Vite** — build tooling with HMR
- **Vitest** — unit testing
- **marked** + **DOMPurify** — safe Markdown rendering
- **idb** — IndexedDB persistence
- **pdfjs-dist** / **mammoth** / **xlsx** — file text extraction

## License

Private
