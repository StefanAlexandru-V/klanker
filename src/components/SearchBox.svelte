<script>
  let { query = $bindable('') } = $props();

  let searchEl = $state(null);
</script>

<div class="search-box">
  <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
  <input
    bind:this={searchEl}
    type="text"
    placeholder="Search conversations..."
    bind:value={query}
  />
  {#if query}
    <button class="search-clear" onclick={() => { query = ''; }} aria-label="Clear search">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  {/if}
</div>

<style>
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
</style>
