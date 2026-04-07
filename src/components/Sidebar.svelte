<script>
  import SearchBox from './SearchBox.svelte';
  import ConversationItem from './ConversationItem.svelte';

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
  let convListEl = $state(null);

  function startRename(id, currentTitle) {
    editingId = id;
    editTitle = currentTitle;
    contextMenuId = '';
  }

  function commitRename(title) {
    if (editingId) {
      onRename(editingId, title);
      editingId = '';
      editTitle = '';
    }
  }

  function cancelRename() {
    editingId = '';
    editTitle = '';
  }

  function closeContextMenu() {
    contextMenuId = '';
  }

  function handleClickOutsideContext(e) {
    if (contextMenuId && !e.target.closest('.context-trigger')) {
      closeContextMenu();
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      if (contextMenuId) {
        closeContextMenu();
      } else if (editingId) {
        cancelRename();
      }
    }
  }

  function handleConvScroll() {
    if (contextMenuId) closeContextMenu();
  }
</script>

<svelte:window onclick={handleClickOutsideContext} onkeydown={handleKeydown} />

<aside class="sidebar">
  <div class="sidebar-header">
    <button class="new-chat-btn" onclick={onNewChat}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      New chat
    </button>
  </div>

  <SearchBox bind:query={searchQuery} />

  <nav class="conv-list" bind:this={convListEl} onscroll={handleConvScroll}>
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
        <ConversationItem
          {conv}
          active={conv.id === activeConvId}
          editing={editingId === conv.id}
          bind:editTitle
          contextOpen={contextMenuId === conv.id}
          onSelect={() => onSelect(conv.id)}
          onStartRename={() => startRename(conv.id, conv.title)}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onToggleContext={() => { contextMenuId = contextMenuId === conv.id ? '' : conv.id; }}
          onDelete={() => { contextMenuId = ''; onDelete(conv.id); }}
        />
      {/each}
    {/if}
  </nav>
</aside>

<style>
  .sidebar {
    width: 280px;
    min-width: 280px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
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

  @media (max-width: 768px) {
    .sidebar {
      width: 300px;
      min-width: 300px;
      box-shadow: var(--shadow);
    }
  }
</style>
