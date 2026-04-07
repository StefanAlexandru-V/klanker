<script>
  /**
   * @type {{
   *   conversations: Array<{id: string, title: string, messages: any[], updatedAt: number}>,
   *   activeConvId: string,
   *   searchQuery: string,
   *   onNewChat: () => void,
   *   onSelect: (id: string) => void,
   *   onDelete: (id: string) => void,
   *   onRename: (id: string, title: string) => void,
   *   onClose: () => void,
   * }}
   */
  let {
    conversations,
    activeConvId,
    searchQuery = $bindable(''),
    onNewChat,
    onSelect,
    onDelete,
    onRename,
    onClose,
  } = $props();

  let editingId = $state('');
  let editTitle = $state('');
  let contextMenuId = $state('');
  let searchEl = $state(null);

  function startRename(id, currentTitle) {
    editingId = id;
    editTitle = currentTitle;
    contextMenuId = '';
  }

  function commitRename() {
    if (editingId) {
      onRename(editingId, editTitle);
      editingId = '';
      editTitle = '';
    }
  }

  /** @param {KeyboardEvent} e */
  function handleRenameKey(e) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') { editingId = ''; editTitle = ''; }
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function handleClickOutsideContext(e) {
    if (contextMenuId && !e.target.closest('.context-trigger')) {
      contextMenuId = '';
    }
  }
</script>

<svelte:window onclick={handleClickOutsideContext} />

<aside class="sidebar">
  <div class="sidebar-header">
    <button class="new-chat-btn" onclick={onNewChat}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      New chat
    </button>
    <button class="close-btn" onclick={onClose} aria-label="Close sidebar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  </div>

  <div class="search-box">
    <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input
      bind:this={searchEl}
      type="text"
      placeholder="Search conversations..."
      bind:value={searchQuery}
    />
    {#if searchQuery}
      <button class="search-clear" onclick={() => { searchQuery = ''; }} aria-label="Clear search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  <nav class="conv-list">
    {#if conversations.length === 0}
      <div class="empty-state">
        {#if searchQuery}
          <p>No results</p>
        {:else}
          <p>No conversations yet</p>
        {/if}
      </div>
    {:else}
      {#each conversations as conv (conv.id)}
        <div
          class="conv-item"
          class:active={conv.id === activeConvId}
          role="button"
          tabindex="0"
          onclick={() => onSelect(conv.id)}
          onkeydown={(e) => { if (e.key === 'Enter') onSelect(conv.id); }}
        >
          {#if editingId === conv.id}
            <input
              class="rename-input"
              type="text"
              bind:value={editTitle}
              onblur={commitRename}
              onkeydown={handleRenameKey}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <div class="conv-content">
              <span class="conv-title">{conv.title}</span>
              <span class="conv-meta">{formatDate(conv.updatedAt)}</span>
            </div>
          {/if}

          <div class="conv-actions">
            <button
              class="action-btn context-trigger"
              onclick={(e) => { e.stopPropagation(); contextMenuId = contextMenuId === conv.id ? '' : conv.id; }}
              aria-label="Conversation options"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
              </svg>
            </button>

            {#if contextMenuId === conv.id}
              <div class="context-menu">
                <button onclick={() => startRename(conv.id, conv.title)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Rename
                </button>
                <button class="danger" onclick={() => { contextMenuId = ''; onDelete(conv.id); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                  Delete
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </nav>
</aside>

<style>
  .sidebar {
    width: 280px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    gap: 8px;
  }

  .new-chat-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    flex: 1;
  }

  .new-chat-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-light);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    color: var(--text-tertiary);
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .search-box {
    position: relative;
    margin: 0 12px 8px;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
    pointer-events: none;
  }

  .search-box input {
    width: 100%;
    padding: 7px 30px 7px 32px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color var(--transition);
  }

  .search-box input:focus {
    border-color: var(--border-light);
  }

  .search-box input::placeholder {
    color: var(--text-tertiary);
  }

  .search-clear {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: var(--text-tertiary);
  }

  .search-clear:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .conv-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .empty-state {
    padding: 24px 12px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }

  .conv-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background var(--transition);
    position: relative;
  }

  .conv-item:hover {
    background: var(--bg-hover);
  }

  .conv-item.active {
    background: var(--bg-tertiary);
  }

  .conv-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .conv-title {
    font-size: 13px;
    font-weight: 450;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conv-meta {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .conv-actions {
    opacity: 0;
    flex-shrink: 0;
    position: relative;
    transition: opacity var(--transition);
  }

  .conv-item:hover .conv-actions,
  .conv-item.active .conv-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: var(--text-tertiary);
  }

  .action-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .rename-input {
    flex: 1;
    padding: 2px 6px;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }

  .context-menu {
    position: absolute;
    right: 0;
    top: 100%;
    min-width: 140px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px;
    box-shadow: var(--shadow);
    z-index: 50;
  }

  .context-menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text-secondary);
    text-align: left;
  }

  .context-menu button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .context-menu button.danger:hover {
    background: var(--error-bg);
    color: var(--error);
  }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 100;
      width: 300px;
      box-shadow: var(--shadow);
    }
  }
</style>
