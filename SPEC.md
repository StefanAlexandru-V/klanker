# Local AI Chatbot — Spec v1.0

## Stack
- Svelte 5 + Vite
- No UI libraries, plain CSS
- LM Studio OpenAI-compatible API (`http://10.3.58.20:1234/v1`)

## Project Structure
```
src/
  lib/
    api.js          # LM Studio API client
    store.js        # Chat state (messages, loading, error)
  components/
    Chat.svelte     # Message list
    Message.svelte  # Single message bubble
    Input.svelte    # Input bar + send button
  App.svelte        # Root layout
  app.css           # Global styles + CSS vars
main.js             # Entry point
```

## Features
- Send messages, receive streamed responses from LM Studio
- Streaming token-by-token display (SSE)
- Loading indicator while model is responding
- Error state if API is unreachable
- Clear conversation button
- Auto-scroll to latest message
- Enter to send, Shift+Enter for newline

## API
- Endpoint: `POST /v1/chat/completions`
- Model: read from `VITE_MODEL_ID` env var, default `qwen/qwen2.5-coder-14b`
- Streaming: `stream: true`
- System prompt: configurable via env var `VITE_SYSTEM_PROMPT`

## Design
- Dark theme, CSS variables for all colors
- Font: Inter or system sans-serif
- Message bubbles: user right (accent color), bot left (subtle bg)
- Input fixed at bottom, full width with send button
- Minimal, no shadows, flat design, clean borders
- Responsive, works at any viewport width

## Environment
```
VITE_API_BASE=http://10.3.58.20:1234/v1
VITE_MODEL_ID=qwen/qwen2.5-coder-14b
VITE_SYSTEM_PROMPT=You are a helpful assistant.
```

## Code Standards
- No TypeScript, plain JS with JSDoc comments
- Each component under 100 lines
- No external dependencies except Svelte + Vite
- All API logic isolated in `api.js`
- Error boundaries on all async calls
- No inline styles

## Testing
- Vitest for unit tests
- Test `api.js` with mocked fetch
- Test store logic (add message, clear, error state)
- No E2E for now
