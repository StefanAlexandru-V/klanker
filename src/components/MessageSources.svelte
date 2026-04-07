<script>
  let { sources } = $props();
</script>

{#if sources?.length}
  <div class="sources">
    <div class="sources-label">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      {sources.length} sources
    </div>
    <div class="sources-list">
      {#each sources as source, i}
        <a class="source-chip" href={source.url} target="_blank" rel="noopener noreferrer">
          <span class="source-num">{i + 1}</span>
          <span class="source-title">{source.title}</span>
        </a>
      {/each}
    </div>
  </div>
{/if}

<style>
  .sources {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .sources-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
  }

  .sources-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .source-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-secondary);
    text-decoration: none;
    transition: all var(--transition);
    max-width: 250px;
  }

  .source-chip:hover {
    border-color: var(--border-light);
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .source-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--border-light);
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .source-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
