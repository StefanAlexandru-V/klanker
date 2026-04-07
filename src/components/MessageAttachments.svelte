<script>
  let { files = [], images = [] } = $props();

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
</script>

{#if images?.length}
  <div class="image-attachments">
    {#each images as img}
      <img class="attached-image" src={img.dataUrl} alt={img.name} />
    {/each}
  </div>
{/if}

{#if files?.length}
  <div class="attachments">
    {#each files as file}
      <div class="file-chip">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-name">{file.name}</span>
        <span class="file-size">{formatSize(file.size)}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .image-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .attached-image {
    max-width: 300px;
    max-height: 300px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    object-fit: contain;
    cursor: pointer;
  }

  .attached-image:hover {
    border-color: var(--border-light);
  }

  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--text-secondary);
  }

  .file-name {
    font-weight: 500;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
  }

  .file-size {
    color: var(--text-tertiary);
  }
</style>
