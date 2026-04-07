/**
 * LM Studio OpenAI-compatible API client with SSE streaming.
 * @module api
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://10.3.58.20:1234/v1';

/**
 * Fetches available models from the LM Studio /models endpoint.
 * @returns {Promise<Array<{id: string, owned_by?: string}>>}
 */
export async function fetchModels() {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data?.data || [];
}

/**
 * Builds the messages array for the API request.
 * Injects file contents as context text, and images as OpenAI vision content parts.
 *
 * @param {Array<{role: string, content: string, files?: Array<{name: string, content: string}>, images?: Array<{dataUrl: string}>}>} messages
 * @returns {Array<{role: string, content: string|Array}>}
 */
export function buildApiMessages(messages) {
  return messages.map((msg) => {
    const hasFiles = msg.files?.length > 0;
    const hasImages = msg.images?.length > 0;

    if (msg.role !== 'user' || (!hasFiles && !hasImages)) {
      return { role: msg.role, content: msg.content };
    }

    let textContent = msg.content;

    if (hasFiles) {
      const fileBlocks = msg.files.map((f) =>
        `** ${f.name} full content **\n\n${f.content}\n\n** end of ${f.name} **`
      ).join('\n\n');
      textContent = `The following content was found in the files provided by the user.\n\n${fileBlocks}\n\nBased on the content above, please provide a response to the user query.\n\nUser query: ${msg.content}`;
    }

    if (!hasImages) {
      return { role: msg.role, content: textContent };
    }

    /** @type {Array<{type: string, text?: string, image_url?: {url: string}}>} */
    const parts = [];

    if (textContent) {
      parts.push({ type: 'text', text: textContent });
    }

    for (const img of msg.images) {
      parts.push({
        type: 'image_url',
        image_url: { url: img.dataUrl },
      });
    }

    return { role: msg.role, content: parts };
  });
}

/**
 * @typedef {object} StreamToken
 * @property {'content'|'reasoning'} type
 * @property {string} text
 */

/**
 * Sends a streaming chat completion request.
 * Yields typed token objects as they arrive via SSE.
 *
 * @param {string} modelId
 * @param {Array<{role: string, content: string}>} messages
 * @param {AbortSignal} [signal]
 * @yields {StreamToken}
 * @throws {Error}
 */
export async function* streamChat(modelId, messages, signal) {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let start = 0;
      while (start < buffer.length) {
        const idx = buffer.indexOf('data: ', start);
        if (idx === -1) {
          const lastNl = buffer.lastIndexOf('\n');
          if (lastNl !== -1) start = lastNl + 1;
          break;
        }

        const payload = buffer.slice(idx + 6);

        if (payload.startsWith('[DONE]')) return;

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          const nextIdx = buffer.indexOf('data: ', idx + 6);
          if (nextIdx === -1) break;
          const segment = buffer.slice(idx + 6, nextIdx).trim();
          if (segment === '[DONE]') return;
          try { parsed = JSON.parse(segment); } catch { start = nextIdx; continue; }
        }

        const delta = parsed.choices?.[0]?.delta;
        if (delta?.reasoning_content) {
          yield { type: 'reasoning', text: delta.reasoning_content };
        }
        if (delta?.content) {
          yield { type: 'content', text: delta.content };
        }

        const nextData = buffer.indexOf('data: ', idx + 6);
        if (nextData === -1) {
          start = buffer.length;
        } else {
          start = nextData;
        }
      }

      if (start > 0) {
        buffer = buffer.slice(start);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
