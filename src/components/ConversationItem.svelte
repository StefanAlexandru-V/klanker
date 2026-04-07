<script>
  /**
   * @type {{
   *   conv: {id: string, title: string, messages: any[], updatedAt: number},
   *   active: boolean,
   *   editing: boolean,
   *   editTitle: string,
   *   contextOpen: boolean,
   *   onSelect: () => void,
   *   onStartRename: () => void,
   *   onCommitRename: (title: string) => void,
   *   onCancelRename: () => void,
   *   onToggleContext: () => void,
   *   onDelete: () => void,
   * }}
   */
  let {
    conv,
    active,
    editing,
    editTitle = $bindable(''),
    contextOpen,
    onSelect,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onToggleContext,
    onDelete,
  } = $props();

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

  let renameInputEl = $state(null);

  $effect(() => {
    if (editing && renameInputEl) {
      renameInputEl.focus();
      renameInputEl.select();
    }
  });

  /** @param {KeyboardEvent} e */
  function handleRenameKey(e) {
    if (e.key === 'Enter') onCommitRename(editTitle);
    if (e.key === 'Escape') onCancelRename();
  }
</script>

<div
  class="conv-item"
  class:active
  role="button"
  tabindex="0"
  onclick={onSelect}
  onkeydown={(e) => { if (e.key === 'Enter') onSelect(); }}
>
  {#if editing}
    <input
      bind:this={renameInputEl}
      class="rename-input"
      type="text"
      bind:value={editTitle}
      onblur={() => onCommitRename(editTitle)}
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
      onclick={(e) => { e.stopPropagation(); onToggleContext(); }}
      aria-label="Conversation options"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
      </svg>
    </button>

    {#if contextOpen}
      <div class="context-menu">
        <button onclick={onStartRename}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Rename
        </button>
        <button class="danger" onclick={onDelete}>
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

<style>
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
</style>
