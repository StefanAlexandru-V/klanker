<script>
  import { formatSize } from '../lib/fileHandler.js';

  let { pendingFiles = [], pendingImages = [], onRemoveFile, onRemoveImage } = $props();
</script>

{#if pendingImages.length > 0}
  <div class="image-list">
    {#each pendingImages as img, i}
      <div class="image-thumb">
        <img src={img.dataUrl} alt={img.name} />
        <button class="image-remove" onclick={() => onRemoveImage(i)} aria-label="Remove {img.name}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

{#if pendingFiles.length > 0}
  <div class="file-list">
    {#each pendingFiles as file, i}
      <div class="file-tag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-tag-name">{file.name}</span>
        <span class="file-tag-size">{formatSize(file.size)}</span>
        <button class="file-remove" onclick={() => onRemoveFile(i)} aria-label="Remove {file.name}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .image-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  .image-thumb {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .image-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .image-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border: none;
    cursor: pointer;
  }
  .image-remove:hover { background: var(--error); }

  .file-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .file-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--text-secondary);
  }

  .file-tag-name {
    font-weight: 500;
    color: var(--text-primary);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-tag-size { color: var(--text-tertiary); }

  .file-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    color: var(--text-tertiary);
    margin-left: 2px;
  }
  .file-remove:hover { color: var(--error); background: var(--error-bg); }
</style>
