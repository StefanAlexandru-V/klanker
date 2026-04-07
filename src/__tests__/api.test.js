import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat, fetchModels, buildApiMessages } from '../lib/api.js';

/**
 * @param {string[]} chunks
 * @returns {ReadableStream}
 */
function mockSSEStream(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

const TEST_MODEL = 'test-model';

describe('streamChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('yields content tokens with type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockSSEStream([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }));

    const tokens = [];
    for await (const token of streamChat(TEST_MODEL, [{ role: 'user', content: 'Hi' }])) {
      tokens.push(token);
    }
    expect(tokens).toEqual([
      { type: 'content', text: 'Hello' },
      { type: 'content', text: ' world' },
    ]);
  });

  it('yields reasoning tokens separately from content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockSSEStream([
        'data: {"choices":[{"delta":{"reasoning_content":"hmm"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }));

    const tokens = [];
    for await (const token of streamChat(TEST_MODEL, [{ role: 'user', content: 'Hi' }])) {
      tokens.push(token);
    }
    expect(tokens).toEqual([
      { type: 'reasoning', text: 'hmm' },
      { type: 'content', text: 'Hi' },
    ]);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, statusText: 'Internal Server Error',
    }));

    const gen = streamChat(TEST_MODEL, [{ role: 'user', content: 'Hi' }]);
    await expect(gen.next()).rejects.toThrow('API error: 500');
  });

  it('throws on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const gen = streamChat(TEST_MODEL, [{ role: 'user', content: 'Hi' }]);
    await expect(gen.next()).rejects.toThrow('Network error');
  });

  it('handles chunks split across reads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockSSEStream([
        'data: {"choices":[{"delta":{"conten',
        't":"split"}}]}\n\ndata: [DONE]\n\n',
      ]),
    }));

    const tokens = [];
    for await (const token of streamChat(TEST_MODEL, [{ role: 'user', content: 'Hi' }])) {
      tokens.push(token);
    }
    expect(tokens).toEqual([{ type: 'content', text: 'split' }]);
  });

  it('skips chunks with no content delta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockSSEStream([
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }));

    const tokens = [];
    for await (const token of streamChat(TEST_MODEL, [{ role: 'user', content: 'Hi' }])) {
      tokens.push(token);
    }
    expect(tokens).toEqual([{ type: 'content', text: 'ok' }]);
  });

  it('handles concatenated SSE chunks without newlines', async () => {
    const packed =
      'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}' +
      'data: {"choices":[{"delta":{"content":"Hello"}}]}' +
      'data: {"choices":[{"delta":{"content":"!"}}]}' +
      'data: [DONE]';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockSSEStream([packed]),
    }));

    const tokens = [];
    for await (const token of streamChat(TEST_MODEL, [{ role: 'user', content: 'Hi' }])) {
      tokens.push(token);
    }
    expect(tokens).toEqual([
      { type: 'reasoning', text: 'think' },
      { type: 'content', text: 'Hello' },
      { type: 'content', text: '!' },
    ]);
  });

  it('sends correct request body with model id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockSSEStream(['data: [DONE]\n\n']),
    });
    vi.stubGlobal('fetch', mockFetch);

    const messages = [{ role: 'user', content: 'test' }];
    for await (const _ of streamChat('my-model', messages)) {
      // consume
    }

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/v1/chat/completions');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body);
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual(messages);
    expect(body.model).toBe('my-model');
  });
});

describe('fetchModels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns model list from API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
    }));

    const models = await fetchModels();
    expect(models).toEqual([{ id: 'model-a' }, { id: 'model-b' }]);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchModels()).rejects.toThrow('Failed to fetch models: 503');
  });
});

describe('buildApiMessages', () => {
  it('passes plain messages through unchanged', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const result = buildApiMessages(msgs);
    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('prepends file content to user messages with attachments', () => {
    const msgs = [
      {
        role: 'user',
        content: 'review this',
        files: [{ name: 'app.js', content: 'const x = 1;' }],
      },
    ];
    const result = buildApiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('** app.js full content **');
    expect(result[0].content).toContain('const x = 1;');
    expect(result[0].content).toContain('** end of app.js **');
    expect(result[0].content).toContain('review this');
  });

  it('does not modify assistant messages even if they have files key', () => {
    const msgs = [{ role: 'assistant', content: 'ok', files: [] }];
    const result = buildApiMessages(msgs);
    expect(result).toEqual([{ role: 'assistant', content: 'ok' }]);
  });

  it('builds multimodal content array for messages with images', () => {
    const msgs = [
      {
        role: 'user',
        content: 'what is this?',
        images: [{ dataUrl: 'data:image/png;base64,abc123' }],
      },
    ];
    const result = buildApiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0].content)).toBe(true);
    expect(result[0].content[0]).toEqual({ type: 'text', text: 'what is this?' });
    expect(result[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc123' },
    });
  });

  it('combines files and images in a single message', () => {
    const msgs = [
      {
        role: 'user',
        content: 'analyze both',
        files: [{ name: 'data.csv', content: 'a,b\n1,2' }],
        images: [{ dataUrl: 'data:image/jpeg;base64,xyz' }],
      },
    ];
    const result = buildApiMessages(msgs);
    expect(Array.isArray(result[0].content)).toBe(true);
    expect(result[0].content[0].type).toBe('text');
    expect(result[0].content[0].text).toContain('** data.csv full content **');
    expect(result[0].content[0].text).toContain('analyze both');
    expect(result[0].content[1].type).toBe('image_url');
  });
});
