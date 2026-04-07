/**
 * Chat state management with multi-conversation support.
 * Persists conversations to IndexedDB.
 * Uses Svelte 5 runes for reactivity.
 * @module store
 */

import { streamChat, fetchModels, buildApiMessages } from './api.js';
import { webSearch, formatSearchContext } from './search.js';
import * as db from './db.js';

const CURRENT_DATE = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

const SYSTEM_PROMPT = `You are Klanker, a knowledgeable and helpful personal assistant.
Current date: ${CURRENT_DATE}.
Your training data has a knowledge cutoff around early 2024. You may not have accurate information about events after that date.

# Core behavior
- Match the user's tone and formality. Keep casual exchanges short and natural.
- Give concise answers to simple questions. Give thorough, well-structured answers to complex ones.
- Never open with flattery ("Great question!", "That's an excellent point!"). Respond directly.
- If you cannot help with something, say so briefly without lecturing or moralizing.
- Ask at most one clarifying question per response, and only when genuinely needed.

# Vision
- You CAN see and analyze images that users attach. Describe them directly.
- Do NOT say you cannot see images — you can.

# Accuracy and honesty
- If you are unsure about a fact, say so explicitly rather than guessing.
- If the user makes a claim you doubt, check it rather than blindly agreeing.
- For anything that may have changed after your knowledge cutoff (news, prices, people in office, software versions, events), use web search.
- When you use information from search results, cite sources with [1], [2], etc.
- Never fabricate URLs, citations, statistics, or quotes.

# Web search tool
You have access to a web search tool. To use it, your ENTIRE response must be exactly one line:

[SEARCH: your search query]

Rules:
- The line above must be your COMPLETE response. No other text before or after it.
- Do NOT explain why you are searching. Do NOT include reasoning. Just the [SEARCH: ...] line.
- Keep queries short: 3-8 keywords.
- You can search for anything: news, facts, links, resources, image galleries, guides, etc.

When to search:
- Current events, recent news, live data, prices, weather, sports scores, software versions.
- When the user asks for links, resources, or recommendations you don't have from memory.
- When you are not confident in your factual knowledge.

When NOT to search:
- Basic knowledge, coding, creative writing, math, or anything you are confident about.
- Analyzing images the user attached — you can see them directly.

After receiving search results:
- Answer the user's question using the search data.
- Cite sources naturally using [1], [2], etc.
- Do NOT list sources separately — the UI displays them automatically.

# Formatting
- Use plain prose for conversational replies. No bullet lists or markdown in casual chat.
- Use markdown (headings, lists, tables, code blocks) for technical content, comparisons, or structured information.
- Use code blocks with language tags for any code snippets.`;

const SEARCH_PATTERN = /\[SEARCH:\s*(.+?)\]/;
const SEARCH_ONLY_PATTERN = /^\s*\[SEARCH:\s*(.+?)\]\s*$/;
const MAX_SEARCH_ROUNDS = 3;

let _convId = 0;
function nextConvId() { return `conv_${++_convId}_${Date.now()}`; }

let _msgId = 0;
function nextMsgId() { return ++_msgId; }

/**
 * @typedef {object} FileAttachment
 * @property {string} name
 * @property {string} content
 * @property {number} size
 */

/**
 * @typedef {object} ImageAttachment
 * @property {string} name
 * @property {string} dataUrl
 * @property {number} size
 */

/**
 * @typedef {object} SearchSource
 * @property {string} title
 * @property {string} url
 * @property {string} content
 */

/**
 * @typedef {object} Message
 * @property {number} id
 * @property {string} role
 * @property {string} content
 * @property {string} [reasoning]
 * @property {FileAttachment[]} [files]
 * @property {ImageAttachment[]} [images]
 * @property {SearchSource[]} [sources]
 * @property {string} [searchQuery]
 */

/**
 * @typedef {object} Conversation
 * @property {string} id
 * @property {string} title
 * @property {Message[]} messages
 * @property {number} createdAt
 * @property {number} updatedAt
 */

export function createChatStore() {
  /** @type {Conversation[]} */
  let conversations = $state([]);
  let activeConvId = $state('');
  let loading = $state(false);
  let searching = $state(false);
  let error = $state('');
  let dbReady = $state(false);

  /** @type {Array<{id: string, owned_by?: string}>} */
  let models = $state([]);
  let selectedModel = $state('');
  let modelsLoading = $state(true);

  let searchQuery = $state('');

  /** @type {AbortController|null} */
  let abortController = null;

  loadModels();
  loadFromDb();

  async function loadFromDb() {
    try {
      const saved = await db.loadConversations();
      if (saved.length > 0) {
        conversations = saved;
        activeConvId = saved[0].id;
        const maxMsg = saved.flatMap((c) => c.messages).reduce((max, m) => Math.max(max, m.id || 0), 0);
        _msgId = maxMsg;
      } else {
        newConversation();
      }
    } catch {
      newConversation();
    } finally {
      dbReady = true;
    }
  }

  /** @param {Conversation} conv */
  function persist(conv) {
    db.saveConversation(conv).catch(() => {});
  }

  async function loadModels() {
    modelsLoading = true;
    try {
      const list = await fetchModels();
      models = list;
      if (list.length > 0 && !selectedModel) {
        selectedModel = list[0].id;
      }
    } catch {
      error = 'Could not load models — is LM Studio running?';
    } finally {
      modelsLoading = false;
    }
  }

  /** @param {string} modelId */
  function setModel(modelId) {
    selectedModel = modelId;
  }

  function newConversation() {
    const conv = {
      id: nextConvId(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    conversations.unshift(conv);
    activeConvId = conv.id;
    persist(conv);
    return conv.id;
  }

  /** @param {string} convId */
  function switchConversation(convId) {
    if (loading) stopGeneration();
    activeConvId = convId;
    error = '';
  }

  /** @param {string} convId */
  function deleteConversation(convId) {
    if (loading && activeConvId === convId) stopGeneration();
    conversations = conversations.filter((c) => c.id !== convId);
    db.deleteConversation(convId).catch(() => {});
    if (activeConvId === convId) {
      if (conversations.length === 0) {
        newConversation();
      } else {
        activeConvId = conversations[0].id;
      }
    }
  }

  /**
   * @param {string} convId
   * @param {string} title
   */
  function renameConversation(convId, title) {
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      conv.title = title.trim() || 'New chat';
      persist(conv);
    }
  }

  function getActiveConversation() {
    return conversations.find((c) => c.id === activeConvId) || null;
  }

  function getActiveMessages() {
    return getActiveConversation()?.messages || [];
  }

  /**
   * @param {Conversation} conv
   * @param {string} content
   */
  function autoTitle(conv, content) {
    if (conv.title === 'New chat') {
      conv.title = content.length > 50
        ? content.slice(0, 50) + '…'
        : content;
    }
  }

  /**
   * Streams a chat response, optionally buffering content to detect [SEARCH:] directives.
   * When bufferForSearch is true, content is held back until we can confirm it's not a
   * search directive. If the model dumps reasoning as content tokens (no reasoning_content),
   * the text before [SEARCH:] is captured as reasoning instead.
   *
   * @param {Array<{role: string, content: string}>} apiMessages
   * @param {object} conv
   * @param {number} assistantIdx
   * @param {{bufferForSearch?: boolean}} [opts]
   * @returns {Promise<string>}
   */
  async function streamResponse(apiMessages, conv, assistantIdx, opts = {}) {
    let fullText = '';
    const msg = conv.messages[assistantIdx];

    for await (const token of streamChat(selectedModel, apiMessages, abortController.signal)) {
      if (token.type === 'reasoning') {
        msg.reasoning = (msg.reasoning || '') + token.text;
      } else {
        fullText += token.text;

        if (opts.bufferForSearch) {
          const trimmed = fullText.trim();
          const searchIdx = trimmed.lastIndexOf('[SEARCH:');
          if (searchIdx !== -1) {
            const afterSearch = trimmed.slice(searchIdx);
            if (!afterSearch.includes(']')) {
              continue;
            }
            if (SEARCH_PATTERN.test(afterSearch)) {
              continue;
            }
          }
        }

        msg.content = fullText;
      }
    }
    return fullText;
  }

  /**
   * @param {string} content
   * @param {FileAttachment[]} [files]
   * @param {ImageAttachment[]} [images]
   */
  async function send(content, files = [], images = []) {
    const trimmed = content.trim();
    if ((!trimmed && files.length === 0 && images.length === 0) || loading || !selectedModel) return;

    const conv = getActiveConversation();
    if (!conv) return;

    error = '';

    const userMsg = {
      id: nextMsgId(),
      role: 'user',
      content: trimmed,
      files: files.length > 0 ? files : undefined,
      images: images.length > 0 ? images : undefined,
    };
    conv.messages.push(userMsg);
    autoTitle(conv, trimmed || files.map((f) => f.name).join(', ') || images.map((i) => i.name).join(', '));

    const assistantMsg = {
      id: nextMsgId(),
      role: 'assistant',
      content: '',
      reasoning: '',
      sources: undefined,
      searchQuery: undefined,
    };
    conv.messages.push(assistantMsg);
    const assistantIdx = conv.messages.length - 1;

    loading = true;
    conv.updatedAt = Date.now();
    abortController = new AbortController();

    try {
      const historyMessages = buildApiMessages(
        conv.messages
          .filter((m) => m.role !== 'system' && m.id !== assistantMsg.id)
          .map((m) => ({
            role: m.role,
            content: m.content,
            files: m.files,
            images: m.images,
          }))
      );

      let apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages,
      ];

      let responseText = await streamResponse(apiMessages, conv, assistantIdx, { bufferForSearch: true });

      let searchRounds = 0;
      while (searchRounds < MAX_SEARCH_ROUNDS) {
        const match = responseText.match(SEARCH_PATTERN);
        if (!match) break;

        const searchTerm = match[1];
        searchRounds++;

        const msg = conv.messages[assistantIdx];

        const searchIdx = responseText.indexOf(match[0]);
        const textBeforeSearch = responseText.slice(0, searchIdx).trim();
        if (textBeforeSearch && !msg.reasoning) {
          msg.reasoning = textBeforeSearch;
        } else if (textBeforeSearch && msg.reasoning) {
          msg.reasoning += '\n\n' + textBeforeSearch;
        }

        msg.content = '';
        msg.searchQuery = searchTerm;

        searching = true;
        let searchContext = '';
        try {
          const results = await webSearch(searchTerm);
          if (results.length > 0) {
            searchContext = formatSearchContext(searchTerm, results);
            const existingUrls = new Set((msg.sources || []).map((s) => s.url));
            const newResults = results.filter((r) => !existingUrls.has(r.url));
            msg.sources = [...(msg.sources || []), ...newResults];
          }
        } catch {
          searchContext = `Web search for "${searchTerm}" failed.`;
        } finally {
          searching = false;
        }

        apiMessages = [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${searchContext}` },
          ...historyMessages,
        ];

        responseText = await streamResponse(apiMessages, conv, assistantIdx, { bufferForSearch: true });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        error = err.message || 'Failed to connect to API';
        if (!conv.messages[assistantIdx].content && !conv.messages[assistantIdx].reasoning) {
          conv.messages = conv.messages.filter((m) => m.id !== assistantMsg.id);
        }
      }
    } finally {
      loading = false;
      searching = false;
      abortController = null;
      conv.updatedAt = Date.now();
      persist(conv);
    }
  }

  function stopGeneration() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    loading = false;
    searching = false;
    const conv = getActiveConversation();
    if (conv) persist(conv);
  }

  function dismissError() {
    error = '';
  }

  /**
   * @returns {Conversation[]}
   */
  function getFilteredConversations() {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      if (conv.title.toLowerCase().includes(q)) return true;
      return conv.messages.some((m) =>
        m.content.toLowerCase().includes(q)
      );
    });
  }

  return {
    get conversations() { return conversations; },
    get activeConvId() { return activeConvId; },
    get loading() { return loading; },
    get searching() { return searching; },
    get error() { return error; },
    get dbReady() { return dbReady; },
    get models() { return models; },
    get selectedModel() { return selectedModel; },
    get modelsLoading() { return modelsLoading; },
    get searchQuery() { return searchQuery; },
    set searchQuery(v) { searchQuery = v; },
    get activeMessages() { return getActiveMessages(); },
    get filteredConversations() { return getFilteredConversations(); },
    get activeConversation() { return getActiveConversation(); },
    send,
    stopGeneration,
    setModel,
    refreshModels: loadModels,
    newConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
    dismissError,
  };
}
