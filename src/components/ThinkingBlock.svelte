<script>
  let { reasoning } = $props();

  let thinkingOpen = $state(false);
</script>

<div class="thinking-block">
  <button class="thinking-toggle" onclick={() => { thinkingOpen = !thinkingOpen; }}>
    <svg class="thinking-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
    <span class="thinking-label">Thought process</span>
    <svg class="thinking-chevron" class:open={thinkingOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  {#if thinkingOpen}
    <div class="thinking-content">{reasoning}</div>
  {/if}
</div>

<style>
  .thinking-block {
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .thinking-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    font-size: 14px;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    text-align: left;
    font-weight: 500;
  }

  .thinking-toggle:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .thinking-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  .thinking-label {
    flex: 1;
  }

  .thinking-chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform var(--transition);
  }

  .thinking-chevron.open {
    transform: rotate(180deg);
  }

  .thinking-content {
    padding: 14px;
    font-size: 14px;
    line-height: 1.65;
    color: var(--text-tertiary);
    white-space: pre-wrap;
    word-break: break-word;
    border-top: 1px solid var(--border);
    max-height: 400px;
    overflow-y: auto;
  }
</style>
