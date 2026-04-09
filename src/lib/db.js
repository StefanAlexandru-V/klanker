/**
 * Persistent conversation storage via shared SQLite API.
 *
 * Replaces the previous IndexedDB implementation to share
 * conversations with the Klanker Voice widget (Python).
 * Both read/write the same SQLite file via the API server.
 *
 * @module db
 */

const API_BASE = '/api';

/**
 * Loads all conversations, sorted by updatedAt descending.
 * @returns {Promise<Array>}
 */
export async function loadConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error(`Failed to load conversations: ${res.status}`);
  const convs = await res.json();
  return convs.map(normalizeConversation);
}

/**
 * Saves a single conversation (insert or update).
 * Handles both new conversations and existing ones.
 * Also persists all messages that don't have a server-assigned id.
 * @param {object} conversation
 * @returns {Promise<void>}
 */
export async function saveConversation(conversation) {
  await fetch(`${API_BASE}/conversations/${conversation.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: conversation.title }),
  });

  if (conversation.messages) {
    for (const msg of conversation.messages) {
      if (msg._serverId) {
        await fetch(`${API_BASE}/messages/${msg._serverId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: msg.content,
            reasoning: msg.reasoning || '',
            sources: msg.sources || [],
            search_query: msg.searchQuery || '',
            tool_calls: msg.toolCalls || [],
          }),
        });
      } else {
        const resp = await fetch(`${API_BASE}/conversations/${conversation.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: msg.role,
            content: msg.content,
            reasoning: msg.reasoning || '',
            sources: msg.sources || [],
            searchQuery: msg.searchQuery || '',
            files: msg.files || [],
            images: msg.images || [],
            toolCalls: msg.toolCalls || [],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          msg._serverId = data.id;
        }
      }
    }
  }
}

/**
 * Deletes a conversation by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteConversation(id) {
  await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' });
}

/**
 * Normalize API response to match the shape the store expects.
 * @param {object} conv
 * @returns {object}
 */
function normalizeConversation(conv) {
  return {
    id: conv.id,
    title: conv.title,
    messages: (conv.messages || []).map((m) => ({
      id: m.id,
      _serverId: m.id,
      role: m.role,
      content: m.content,
      reasoning: m.reasoning || '',
      sources: m.sources || [],
      searchQuery: m.search_query || m.searchQuery || '',
      files: m.files || [],
      images: m.images || [],
      toolCalls: m.tool_calls || m.toolCalls || [],
    })),
    createdAt: conv.created_at || conv.createdAt,
    updatedAt: conv.updated_at || conv.updatedAt,
  };
}
