<script>
  /**
   * @type {{
   *   models: Array<{id: string}>,
   *   selectedModel: string,
   *   modelsLoading: boolean,
   *   onSelect: (id: string) => void,
   *   onRefresh: () => void,
   * }}
   */
  let { models, selectedModel, modelsLoading, onSelect, onRefresh } = $props();

  let open = $state(false);
  let focusedIndex = $state(-1);
  let dropdownEl = $state(null);

  $effect(() => {
    if (open && dropdownEl) {
      dropdownEl.focus();
      focusedIndex = models.findIndex((m) => m.id === selectedModel);
    }
  });

  function formatName(id) {
    const parts = id.split('/');
    return parts[parts.length - 1];
  }

  function select(id) {
    onSelect(id);
    open = false;
  }

  function handleClickOutside(e) {
    if (open && !e.target.closest('.model-selector')) {
      open = false;
      focusedIndex = -1;
    }
  }

  /** @param {KeyboardEvent} e */
  function handleTriggerKeydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) open = true;
    } else if (e.key === 'Escape' && open) {
      open = false;
      focusedIndex = -1;
    }
  }

  /** @param {KeyboardEvent} e */
  function handleDropdownKeydown(e) {
    if (!open || models.length === 0) return;
    e.stopPropagation();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = (focusedIndex + 1) % models.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = (focusedIndex - 1 + models.length) % models.length;
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      select(models[focusedIndex].id);
      focusedIndex = -1;
    } else if (e.key === 'Escape') {
      open = false;
      focusedIndex = -1;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="model-selector">
  <button class="trigger" onclick={(e) => { e.stopPropagation(); open = !open; }} onkeydown={handleTriggerKeydown}>
    {#if modelsLoading}
      <span class="dot loading"></span>
      <span class="label">Loading…</span>
    {:else if selectedModel}
      <span class="dot online"></span>
      <span class="label">{formatName(selectedModel)}</span>
    {:else}
      <span class="dot offline"></span>
      <span class="label">No models</span>
    {/if}
    <svg class="chevron" class:open width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  {#if open && models.length > 0}
    <div bind:this={dropdownEl} class="dropdown" role="listbox" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={handleDropdownKeydown}>
      <div class="dropdown-header">
        <span>Models</span>
        <button class="refresh" onclick={onRefresh} aria-label="Refresh models" title="Refresh models">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>
          </svg>
        </button>
      </div>
      {#each models as model, i (model.id)}
        <button
          class="option"
          class:active={model.id === selectedModel}
          class:focused={focusedIndex === i}
          role="option"
          aria-selected={model.id === selectedModel}
          onclick={() => select(model.id)}
        >
          <div class="option-info">
            <span class="option-name">{formatName(model.id)}</span>
            <span class="option-id">{model.id}</span>
          </div>
          {#if model.id === selectedModel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-selector {
    position: relative;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-secondary);
    padding: 4px 8px;
    border-radius: var(--radius);
    border: 1px solid transparent;
    font-weight: 500;
    white-space: nowrap;
  }

  .trigger:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .label {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    opacity: 0.5;
    transition: transform var(--transition);
  }
  .chevron.open { transform: rotate(180deg); }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.online { background: var(--success); }
  .dot.offline { background: var(--text-tertiary); }
  .dot.loading {
    background: var(--text-tertiary);
    animation: pulse-dot 1s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 320px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: var(--shadow);
    z-index: 100;
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
    border-bottom: 1px solid var(--border);
  }

  .refresh {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    color: var(--text-tertiary);
  }
  .refresh:hover { color: var(--text-primary); background: var(--bg-hover); }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    text-align: left;
    color: var(--text-secondary);
  }
  .option:hover, .option.focused { background: var(--bg-hover); color: var(--text-primary); }
  .option.active { color: var(--text-primary); }

  .option-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .option-name { font-size: 13px; font-weight: 500; }
  .option-id {
    font-size: 11px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
