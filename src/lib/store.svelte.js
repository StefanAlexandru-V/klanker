/**
 * Chat state management with multi-conversation support.
 * Persists conversations to SQLite via API server.
 * Uses Svelte 5 runes for reactivity.
 * @module store
 */

import { streamChat, fetchModels, buildApiMessages } from './api.js';
import { webSearch, formatSearchContext } from './search.js';
import { parseTool, hasIncompleteDirective, fetchTools, executeTool as executeToolApi, buildToolPrompt } from './tools.js';
import * as db from './db.js';

const CURRENT_DATE = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

const BASE_SYSTEM_PROMPT = `You are Klanker, a knowledgeable and helpful personal assistant.
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
- For anything that may have changed after your knowledge cutoff (news, prices, people in office, software versions, events), use your tools.
- When you use information from search results, cite sources with [1], [2], etc.
- Never fabricate URLs, citations, statistics, or quotes.

# Formatting
- Use plain prose for conversational replies. No bullet lists or markdown in casual chat.
- Use markdown (headings, lists, tables, code blocks) for technical content, comparisons, or structured information.
- Use code blocks with language tags for any code snippets.`;

const MAX_TOOL_ROUNDS = 5;
const MAX_SOURCES = 5;

const THINKING_HEADERS = /^\s*(Thought process|Thinking Process|<think>)[:\s]*/i;

let _convId = 0;
function nextConvId() { return `conv_${++_convId}_${Date.now()}`; }

let _msgId = 0;
function nextMsgId() { return ++_msgId; }

let _toolCallId = 0;
function nextToolCallId() { return `tc_${++_toolCallId}_${Date.now()}`; }

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
 * @typedef {object} ToolCall
 * @property {string} id
 * @property {string} tool
 * @property {object} params
 * @property {'pending'|'approved'|'running'|'completed'|'denied'|'failed'} status
 * @property {string} [output]
 * @property {string} [error]
 * @property {number} [duration]
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
 * @property {ToolCall[]} [toolCalls]
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

  /** @type {Array<{name: string, description: string, params: object, requiresApproval: boolean}>} */
  let availableTools = [];
  let systemPrompt = BASE_SYSTEM_PROMPT;

  /** @type {Set<string>} Session allowlist for approved command patterns */
  let sessionAllowlist = new Set();

  /** @type {{ resolve: Function, reject: Function } | null} */
  let pendingApproval = null;

  loadModels();
  loadToolsAndPrompt();
  loadFromDb();

  async function loadToolsAndPrompt() {
    try {
      availableTools = await fetchTools();
      const toolSection = buildToolPrompt(availableTools);
      if (toolSection) {
        systemPrompt = BASE_SYSTEM_PROMPT + '\n\n' + toolSection;
      }
    } catch {
      // Tools not available — fall back to base prompt
    }
  }

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
   * Check if a command pattern is in the session allowlist.
   * Patterns are stored as "tool:cmd_prefix" (first 2 words of shell commands).
   * @param {string} tool
   * @param {object} params
   * @returns {boolean}
   */
  function isSessionAllowed(tool, params) {
    if (tool === 'shell') {
      const cmd = params.cmd || '';
      const prefix = cmd.split(/\s+/).slice(0, 2).join(' ');
      return sessionAllowlist.has(`shell:${prefix}`);
    }
    if (tool === 'read_file') {
      const dir = (params.path || '').split('/').slice(0, -1).join('/');
      return sessionAllowlist.has(`read_file:${dir}`);
    }
    return false;
  }

  /**
   * Add a command pattern to the session allowlist.
   * @param {string} tool
   * @param {object} params
   */
  function addToSessionAllowlist(tool, params) {
    if (tool === 'shell') {
      const cmd = params.cmd || '';
      const prefix = cmd.split(/\s+/).slice(0, 2).join(' ');
      sessionAllowlist.add(`shell:${prefix}`);
    } else if (tool === 'read_file') {
      const dir = (params.path || '').split('/').slice(0, -1).join('/');
      sessionAllowlist.add(`read_file:${dir}`);
    }
  }

  /**
   * Streams a chat response, buffering to detect tool directives.
   * Handles thinking-as-content from models like Gemma.
   *
   * @param {Array<{role: string, content: string}>} apiMessages
   * @param {object} conv
   * @param {number} assistantIdx
   * @returns {Promise<string>}
   */
  async function streamResponse(apiMessages, conv, assistantIdx) {
    let fullText = '';
    const msg = conv.messages[assistantIdx];
    let inThinkBlock = false;

    for await (const token of streamChat(selectedModel, apiMessages, abortController.signal)) {
      if (token.type === 'reasoning') {
        msg.reasoning = (msg.reasoning || '') + token.text;
      } else {
        fullText += token.text;

        const trimmed = fullText.trim();

        if (THINKING_HEADERS.test(trimmed) && !inThinkBlock) {
          inThinkBlock = true;
        }

        if (hasIncompleteDirective(trimmed)) {
          continue;
        }

        const parsed = parseTool(trimmed);
        if (parsed) {
          continue;
        }

        if (inThinkBlock) {
          continue;
        }

        msg.content = fullText;
      }
    }

    if (inThinkBlock) {
      fullText = stripThinking(fullText, msg);
    }

    return fullText;
  }

  /**
   * Strips thinking/reasoning content that models dump as regular content.
   * @param {string} text
   * @param {object} msg
   * @returns {string}
   */
  function stripThinking(text, msg) {
    let clean = text;

    const thinkOpen = clean.search(/<think>/i);
    if (thinkOpen !== -1) {
      const thinkClose = clean.search(/<\/think>/i);
      if (thinkClose !== -1) {
        const thinking = clean.slice(thinkOpen + 7, thinkClose).trim();
        if (thinking) {
          msg.reasoning = msg.reasoning ? msg.reasoning + '\n\n' + thinking : thinking;
        }
        clean = (clean.slice(0, thinkOpen) + clean.slice(thinkClose + 8)).trim();
      } else {
        const thinking = clean.slice(thinkOpen + 7).trim();
        if (thinking) {
          msg.reasoning = msg.reasoning ? msg.reasoning + '\n\n' + thinking : thinking;
        }
        clean = clean.slice(0, thinkOpen).trim();
      }
      return clean;
    }

    const headerMatch = clean.match(THINKING_HEADERS);
    if (headerMatch) {
      clean = clean.slice(headerMatch[0].length);
    }

    const toolParsed = parseTool(clean);
    if (toolParsed) {
      const directiveStr = clean.match(/\[(?:TOOL|SEARCH):/);
      if (directiveStr) {
        const idx = clean.indexOf(directiveStr[0]);
        if (idx > 0) {
          const thinking = clean.slice(0, idx).trim();
          if (thinking) {
            msg.reasoning = msg.reasoning ? msg.reasoning + '\n\n' + thinking : thinking;
          }
          clean = clean.slice(idx).trim();
        }
      }
    } else {
      const thinking = clean.trim();
      if (thinking) {
        msg.reasoning = msg.reasoning ? msg.reasoning + '\n\n' + thinking : thinking;
      }
      clean = '';
    }

    return clean;
  }

  /**
   * Execute a tool call. Handles search specially (client-side SearXNG).
   * For other tools, calls the API server.
   *
   * @param {ToolCall} tc
   * @param {object} msg
   * @returns {Promise<{ contextAddition: string }>}
   */
  async function executeToolCall(tc, msg) {
    if (tc.tool === 'search') {
      const query = tc.params.query;
      tc.status = 'running';
      msg.searchQuery = query;
      searching = true;

      try {
        const results = await webSearch(query);
        tc.status = 'completed';
        tc.output = `${results.length} results found`;

        if (results.length > 0) {
          const existingUrls = new Set((msg.sources || []).map((s) => s.url));
          const newResults = results.filter((r) => !existingUrls.has(r.url));
          msg.sources = [...(msg.sources || []), ...newResults].slice(0, MAX_SOURCES);
          return { contextAddition: formatSearchContext(query, results) };
        }
        return { contextAddition: `Web search for "${query}" returned no results.` };
      } catch {
        tc.status = 'failed';
        tc.error = 'Search failed';
        return { contextAddition: `Web search for "${query}" failed.` };
      } finally {
        searching = false;
      }
    }

    // Non-search tools — call API server
    tc.status = 'running';
    try {
      const result = await executeToolApi(tc.tool, tc.params, true);
      tc.duration = result.duration;

      if (result.ok) {
        tc.status = 'completed';
        tc.output = result.content || result.output || '';
        const truncNote = result.truncated ? '\n(output truncated)' : '';
        return { contextAddition: `Tool "${tc.tool}" output:\n${tc.output}${truncNote}` };
      } else {
        tc.status = 'failed';
        tc.error = result.error;
        return { contextAddition: `Tool "${tc.tool}" failed: ${result.error}` };
      }
    } catch (err) {
      tc.status = 'failed';
      tc.error = err.message;
      return { contextAddition: `Tool "${tc.tool}" failed: ${err.message}` };
    }
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
      toolCalls: [],
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
        { role: 'system', content: systemPrompt },
        ...historyMessages,
      ];

      let responseText = await streamResponse(apiMessages, conv, assistantIdx);

      // Tool loop — accumulate tool exchanges as assistant/tool message pairs
      // so the model sees the full conversation history of what it tried
      let toolRounds = 0;
      let toolExchanges = [];

      while (toolRounds < MAX_TOOL_ROUNDS) {
        const parsed = parseTool(responseText);
        if (!parsed) break;

        toolRounds++;
        const msg = conv.messages[assistantIdx];

        // Extract text before the directive as reasoning
        const directiveMatch = responseText.match(/\[(?:TOOL|SEARCH):/);
        if (directiveMatch) {
          const idx = responseText.indexOf(directiveMatch[0]);
          const textBefore = responseText.slice(0, idx).trim();
          if (textBefore) {
            msg.reasoning = msg.reasoning ? msg.reasoning + '\n\n' + textBefore : textBefore;
          }
        }

        msg.content = '';

        // Create tool call record — must re-read from the array after push
        // so that subsequent mutations go through Svelte 5's $state proxy.
        if (!msg.toolCalls) msg.toolCalls = [];
        msg.toolCalls.push({
          id: nextToolCallId(),
          tool: parsed.tool,
          params: parsed.params,
          status: 'pending',
          output: undefined,
          error: undefined,
          duration: undefined,
        });
        let tc = msg.toolCalls[msg.toolCalls.length - 1];

        // Check if approval is needed
        let needsApproval = false;
        if (parsed.tool === 'shell' || parsed.tool === 'read_file') {
          const preCheck = await executeToolApi(parsed.tool, parsed.params, false);
          if (preCheck.code === 'NEEDS_APPROVAL' && !isSessionAllowed(parsed.tool, parsed.params)) {
            needsApproval = true;
          } else if (preCheck.code === 'BLOCKED') {
            tc.status = 'failed';
            tc.error = preCheck.error;
            const toolResult = `Tool "${parsed.tool}" with ${JSON.stringify(parsed.params)} was BLOCKED: ${preCheck.error}`;
            toolExchanges.push(
              { role: 'assistant', content: responseText },
              { role: 'user', content: `[Tool result]: ${toolResult}` },
            );
            apiMessages = [
              { role: 'system', content: systemPrompt },
              ...historyMessages,
              ...toolExchanges,
            ];
            responseText = await streamResponse(apiMessages, conv, assistantIdx);
            continue;
          }
        }

        if (needsApproval) {
          tc.status = 'pending';

          // Wait for user approval
          const approved = await new Promise((resolve) => {
            pendingApproval = { resolve };
          });
          pendingApproval = null;

          if (!approved) {
            tc.status = 'denied';
            const toolResult = `Tool "${parsed.tool}" with ${JSON.stringify(parsed.params)} was DENIED by the user. Respond helpfully without using that tool.`;
            toolExchanges.push(
              { role: 'assistant', content: responseText },
              { role: 'user', content: `[Tool result]: ${toolResult}` },
            );
            apiMessages = [
              { role: 'system', content: systemPrompt },
              ...historyMessages,
              ...toolExchanges,
            ];
            responseText = await streamResponse(apiMessages, conv, assistantIdx);
            continue;
          }

          tc.status = 'approved';
        }

        // Execute the tool
        const { contextAddition } = await executeToolCall(tc, msg);

        // Add this exchange as assistant turn (tool call) + user turn (tool result)
        toolExchanges.push(
          { role: 'assistant', content: responseText },
          { role: 'user', content: `[Tool result]: ${contextAddition}` },
        );

        // Re-prompt with full history including all tool exchanges
        apiMessages = [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          ...toolExchanges,
        ];

        responseText = await streamResponse(apiMessages, conv, assistantIdx);
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
      pendingApproval = null;
      conv.updatedAt = Date.now();
      persist(conv);
    }
  }

  /**
   * Approve or deny a pending tool call.
   * @param {boolean} approved
   * @param {boolean} [forSession=false] — add to session allowlist
   */
  function resolveToolApproval(approved, forSession = false) {
    if (!pendingApproval) return;

    if (approved && forSession) {
      const conv = getActiveConversation();
      if (conv) {
        const pendingTc = conv.messages
          .flatMap((m) => m.toolCalls || [])
          .find((tc) => tc.status === 'pending');
        if (pendingTc) {
          addToSessionAllowlist(pendingTc.tool, pendingTc.params);
        }
      }
    }

    pendingApproval.resolve(approved);
  }

  function stopGeneration() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (pendingApproval) {
      pendingApproval.resolve(false);
      pendingApproval = null;
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
    get hasPendingApproval() { return pendingApproval !== null; },
    send,
    stopGeneration,
    setModel,
    refreshModels: loadModels,
    newConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
    dismissError,
    resolveToolApproval,
  };
}
