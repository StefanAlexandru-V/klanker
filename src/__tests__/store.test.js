import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/api.js', () => ({
  streamChat: vi.fn(),
  fetchModels: vi.fn().mockResolvedValue([
    { id: 'model-a' },
    { id: 'model-b' },
  ]),
  buildApiMessages: vi.fn((msgs) =>
    msgs.map((m) => ({ role: m.role, content: m.content }))
  ),
}));

vi.mock('../lib/search.js', () => ({
  webSearch: vi.fn().mockResolvedValue([]),
  formatSearchContext: vi.fn(() => 'search context'),
}));

vi.mock('../lib/db.js', () => ({
  loadConversations: vi.fn().mockResolvedValue([]),
  saveConversation: vi.fn().mockResolvedValue(undefined),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}));

import { streamChat, fetchModels } from '../lib/api.js';
import { webSearch } from '../lib/search.js';
import * as dbMock from '../lib/db.js';

describe('store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchModels.mockResolvedValue([
      { id: 'model-a' },
      { id: 'model-b' },
    ]);
    dbMock.loadConversations.mockResolvedValue([]);
    dbMock.saveConversation.mockResolvedValue(undefined);
    dbMock.deleteConversation.mockResolvedValue(undefined);
  });

  it('loads models on creation and auto-selects first', async () => {
    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => {
      expect(store.modelsLoading).toBe(false);
    });

    expect(store.models).toHaveLength(2);
    expect(store.selectedModel).toBe('model-a');
  });

  it('creates a default conversation on init', async () => {
    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.dbReady).toBe(true));

    expect(store.conversations.length).toBeGreaterThanOrEqual(1);
    expect(store.activeConvId).toBeTruthy();
    expect(store.activeMessages).toEqual([]);
  });

  it('can create and switch conversations', async () => {
    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.dbReady).toBe(true));
    const firstId = store.activeConvId;

    store.newConversation();
    const secondId = store.activeConvId;
    expect(secondId).not.toBe(firstId);

    store.switchConversation(firstId);
    expect(store.activeConvId).toBe(firstId);
  });

  it('can delete a conversation and fall back to another', async () => {
    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.dbReady).toBe(true));
    const firstId = store.activeConvId;

    store.newConversation();
    const secondId = store.activeConvId;

    store.deleteConversation(secondId);
    expect(store.activeConvId).toBe(firstId);
    expect(store.conversations.every((c) => c.id !== secondId)).toBe(true);
  });

  it('creates a new conversation when deleting the last one', async () => {
    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.dbReady).toBe(true));

    while (store.conversations.length > 1) {
      store.deleteConversation(store.conversations[1].id);
    }

    const onlyId = store.conversations[0].id;
    store.deleteConversation(onlyId);

    expect(store.conversations.length).toBe(1);
    expect(store.activeConvId).toBeTruthy();
  });

  it('renames a conversation', async () => {
    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.dbReady).toBe(true));

    store.renameConversation(store.activeConvId, 'My Chat');
    expect(store.activeConversation.title).toBe('My Chat');
  });

  it('sends a message and streams response into active conversation', async () => {
    async function* fakeStream() {
      yield { type: 'content', text: 'Hello ' };
      yield { type: 'content', text: 'there' };
    }
    streamChat.mockReturnValue(fakeStream());

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => {
      expect(store.modelsLoading).toBe(false);
    });

    await store.send('Hi');

    expect(store.activeMessages).toHaveLength(2);
    expect(store.activeMessages[0].role).toBe('user');
    expect(store.activeMessages[0].content).toBe('Hi');
    expect(store.activeMessages[1].role).toBe('assistant');
    expect(store.activeMessages[1].content).toBe('Hello there');
  });

  it('separates reasoning from content tokens', async () => {
    async function* fakeStream() {
      yield { type: 'reasoning', text: 'Let me think' };
      yield { type: 'reasoning', text: '...' };
      yield { type: 'content', text: 'Answer' };
    }
    streamChat.mockReturnValue(fakeStream());

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('question');

    const assistant = store.activeMessages[1];
    expect(assistant.reasoning).toBe('Let me think...');
    expect(assistant.content).toBe('Answer');
  });

  it('passes selected model to streamChat', async () => {
    async function* fakeStream() { yield { type: 'content', text: 'ok' }; }
    streamChat.mockReturnValue(fakeStream());

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    store.setModel('model-b');
    await store.send('test');

    expect(streamChat).toHaveBeenCalledOnce();
    expect(streamChat.mock.calls[0][0]).toBe('model-b');
  });

  it('auto-titles conversation from first user message', async () => {
    async function* fakeStream() { yield { type: 'content', text: 'ok' }; }
    streamChat.mockReturnValue(fakeStream());

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    expect(store.activeConversation.title).toBe('New chat');
    await store.send('What is the meaning of life?');
    expect(store.activeConversation.title).toBe('What is the meaning of life?');
  });

  it('filters conversations by search query', async () => {
    async function* fakeStream() { yield { type: 'content', text: 'ok' }; }

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    streamChat.mockReturnValue(fakeStream());
    await store.send('alpha topic');

    store.newConversation();
    streamChat.mockReturnValue((async function* () { yield { type: 'content', text: 'ok' }; })());
    await store.send('beta topic');

    store.searchQuery = 'alpha';
    expect(store.filteredConversations.length).toBe(1);
    expect(store.filteredConversations[0].title).toContain('alpha');

    store.searchQuery = '';
    expect(store.filteredConversations.length).toBe(2);
  });

  it('sets error when models fail to load', async () => {
    fetchModels.mockRejectedValue(new Error('fail'));

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => {
      expect(store.modelsLoading).toBe(false);
    });

    expect(store.error).toContain('Could not load models');
  });

  it('handles send with file attachments', async () => {
    async function* fakeStream() { yield { type: 'content', text: 'got it' }; }
    streamChat.mockReturnValue(fakeStream());

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('review this', [{ name: 'test.js', content: 'code', size: 4 }]);

    expect(store.activeMessages[0].files).toHaveLength(1);
    expect(store.activeMessages[0].files[0].name).toBe('test.js');
  });

  it('performs agentic search when model requests [SEARCH:]', async () => {
    const searchResults = [
      { title: 'Result 1', url: 'https://example.com', content: 'info' },
    ];
    webSearch.mockResolvedValue(searchResults);

    let callCount = 0;
    streamChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return (async function* () {
          yield { type: 'content', text: '[SEARCH: latest news]' };
        })();
      }
      return (async function* () {
        yield { type: 'content', text: 'Here are the results.' };
      })();
    });

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('what is happening today?');

    expect(webSearch).toHaveBeenCalledWith('latest news');
    expect(streamChat).toHaveBeenCalledTimes(2);
    const assistant = store.activeMessages[1];
    expect(assistant.sources).toHaveLength(1);
    expect(assistant.content).toBe('Here are the results.');
  });

  it('does not search when model responds normally', async () => {
    async function* fakeStream() { yield { type: 'content', text: 'just a normal reply' }; }
    streamChat.mockReturnValue(fakeStream());

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('hello');

    expect(webSearch).not.toHaveBeenCalled();
    expect(store.activeMessages[1].sources).toBeUndefined();
    expect(store.activeMessages[1].content).toBe('just a normal reply');
  });

  it('preserves reasoning across search rounds', async () => {
    const searchResults = [
      { title: 'WoW Guide', url: 'https://example.com/wow', content: 'mythic tips' },
    ];
    webSearch.mockResolvedValue(searchResults);

    let callCount = 0;
    streamChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return (async function* () {
          yield { type: 'reasoning', text: 'The user wants Mythic+ info.' };
          yield { type: 'reasoning', text: ' I should search for current data.' };
          yield { type: 'content', text: '[SEARCH: WoW Mythic+ tips 2026]' };
        })();
      }
      return (async function* () {
        yield { type: 'content', text: 'Here are the latest Mythic+ tips [1].' };
      })();
    });

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('Mythic+ mostly');

    const assistant = store.activeMessages[1];
    expect(assistant.reasoning).toBe('The user wants Mythic+ info. I should search for current data.');
    expect(assistant.content).toBe('Here are the latest Mythic+ tips [1].');
    expect(assistant.content).not.toContain('[SEARCH:');
    expect(assistant.sources).toHaveLength(1);
    expect(assistant.searchQuery).toBe('WoW Mythic+ tips 2026');
  });

  it('does not flash [SEARCH:] text in content during buffered streaming', async () => {
    webSearch.mockResolvedValue([]);

    const contentSnapshots = [];
    let callCount = 0;
    streamChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return (async function* () {
          yield { type: 'content', text: '[SE' };
          yield { type: 'content', text: 'ARCH: some query]' };
        })();
      }
      return (async function* () {
        yield { type: 'content', text: 'Final answer.' };
      })();
    });

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    const sendPromise = store.send('test search');

    const checkInterval = setInterval(() => {
      const msgs = store.activeMessages;
      if (msgs.length > 1) {
        contentSnapshots.push(msgs[1].content);
      }
    }, 1);

    await sendPromise;
    clearInterval(checkInterval);

    for (const snap of contentSnapshots) {
      expect(snap).not.toContain('[SEARCH:');
    }
    expect(store.activeMessages[1].content).toBe('Final answer.');
  });

  it('handles multiple search rounds accumulating sources', async () => {
    const results1 = [{ title: 'R1', url: 'https://a.com', content: 'first' }];
    const results2 = [{ title: 'R2', url: 'https://b.com', content: 'second' }];

    let searchCount = 0;
    webSearch.mockImplementation(() => {
      searchCount++;
      return Promise.resolve(searchCount === 1 ? results1 : results2);
    });

    let callCount = 0;
    streamChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return (async function* () {
          yield { type: 'content', text: '[SEARCH: first query]' };
        })();
      }
      if (callCount === 2) {
        return (async function* () {
          yield { type: 'content', text: '[SEARCH: second query]' };
        })();
      }
      return (async function* () {
        yield { type: 'content', text: 'Combined answer [1][2].' };
      })();
    });

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('complex question');

    const assistant = store.activeMessages[1];
    expect(assistant.sources).toHaveLength(2);
    expect(assistant.sources[0].title).toBe('R1');
    expect(assistant.sources[1].title).toBe('R2');
    expect(assistant.content).toBe('Combined answer [1][2].');
    expect(streamChat).toHaveBeenCalledTimes(3);
  });

  it('handles model dumping reasoning as content tokens before [SEARCH:]', async () => {
    const searchResults = [
      { title: 'WoW Guide', url: 'https://wowhead.com', content: 'mythic tips' },
    ];
    webSearch.mockResolvedValue(searchResults);

    let callCount = 0;
    streamChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return (async function* () {
          yield { type: 'content', text: 'Thinking Process:\n1. The user is asking about Mythic+.\n' };
          yield { type: 'content', text: '2. I need to search for current data.\n' };
          yield { type: 'content', text: '[SEARCH: WoW Mythic+ tips 2026]' };
        })();
      }
      return (async function* () {
        yield { type: 'content', text: 'Here are the latest Mythic+ tips [1].' };
      })();
    });

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('What is new with Mythic+?');

    const assistant = store.activeMessages[1];
    expect(assistant.content).toBe('Here are the latest Mythic+ tips [1].');
    expect(assistant.content).not.toContain('[SEARCH:');
    expect(assistant.content).not.toContain('Thinking Process');
    expect(assistant.reasoning).toContain('The user is asking about Mythic+');
    expect(assistant.sources).toHaveLength(1);
    expect(assistant.searchQuery).toBe('WoW Mythic+ tips 2026');
    expect(webSearch).toHaveBeenCalledWith('WoW Mythic+ tips 2026');
  });

  it('handles model reasoning-as-content across multiple search rounds', async () => {
    let searchCount = 0;
    webSearch.mockImplementation(() => {
      searchCount++;
      return Promise.resolve([
        { title: `Result ${searchCount}`, url: `https://r${searchCount}.com`, content: 'info' },
      ]);
    });

    let callCount = 0;
    streamChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return (async function* () {
          yield { type: 'content', text: 'Let me think... I should search.\n[SEARCH: first query]' };
        })();
      }
      if (callCount === 2) {
        return (async function* () {
          yield { type: 'content', text: 'Need more info.\n[SEARCH: second query]' };
        })();
      }
      return (async function* () {
        yield { type: 'content', text: 'Final answer with [1] and [2].' };
      })();
    });

    const { createChatStore } = await import('../lib/store.svelte.js');
    const store = createChatStore();

    await vi.waitFor(() => expect(store.modelsLoading).toBe(false));

    await store.send('complex question');

    const assistant = store.activeMessages[1];
    expect(assistant.content).toBe('Final answer with [1] and [2].');
    expect(assistant.reasoning).toContain('Let me think');
    expect(assistant.reasoning).toContain('Need more info');
    expect(assistant.sources).toHaveLength(2);
    expect(streamChat).toHaveBeenCalledTimes(3);
  });
});
