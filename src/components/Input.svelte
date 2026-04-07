<script>
  import { extractText, isSupported, supportedTypesLabel } from '../lib/fileParser.js';

  /**
   * @type {{
   *   onSend: (msg: string, files?: Array<{name: string, content: string, size: number}>, images?: Array<{name: string, dataUrl: string, size: number}>) => void,
   *   disabled: boolean,
   *   loading: boolean,
   *   onStop: () => void,
   * }}
   */
  let { onSend, disabled, loading, onStop } = $props();

  let text = $state('');
  let textareaEl = $state(null);
  /** @type {Array<{name: string, content: string, size: number}>} */
  let pendingFiles = $state([]);
  /** @type {Array<{name: string, dataUrl: string, size: number}>} */
  let pendingImages = $state([]);
  let fileInputEl = $state(null);
  let dragOver = $state(false);
  let fileError = $state('');
  let parsing = $state(false);

  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const MAX_SIZE = 10 * 1024 * 1024;

  function handleSubmit() {
    if (loading) { onStop(); return; }
    if ((!text.trim() && pendingFiles.length === 0 && pendingImages.length === 0) || disabled) return;
    onSend(text, [...pendingFiles], [...pendingImages]);
    text = '';
    pendingFiles = [];
    pendingImages = [];
    fileError = '';
    if (textareaEl) textareaEl.style.height = 'auto';
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function autoResize() {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
  }

  function openFilePicker() {
    fileInputEl?.click();
  }

  /**
   * Reads a File as a base64 data URL.
   * @param {File} file
   * @returns {Promise<string>}
   */
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(/** @type {string} */ (reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** @param {FileList} fileList */
  async function processFiles(fileList) {
    fileError = '';
    const skipped = [];

    for (const file of fileList) {
      if (file.size > MAX_SIZE) {
        skipped.push(`${file.name} (too large, max 10 MB)`);
        continue;
      }

      if (IMAGE_TYPES.has(file.type)) {
        if (pendingImages.some((i) => i.name === file.name)) continue;
        try {
          const dataUrl = await readAsDataUrl(file);
          pendingImages.push({ name: file.name, dataUrl, size: file.size });
          pendingImages = pendingImages;
        } catch {
          skipped.push(`${file.name} (could not read image)`);
        }
        continue;
      }

      if (pendingFiles.some((f) => f.name === file.name)) continue;
      if (!isSupported(file)) {
        skipped.push(`${file.name} (unsupported type)`);
        continue;
      }
      try {
        parsing = true;
        const result = await extractText(file);
        if (!result.content.trim()) {
          skipped.push(`${file.name} (no text content found)`);
          continue;
        }
        pendingFiles.push(result);
        pendingFiles = pendingFiles;
      } catch (err) {
        skipped.push(`${file.name} (${err.message})`);
      } finally {
        parsing = false;
      }
    }

    if (skipped.length > 0) {
      fileError = `Skipped: ${skipped.join(', ')}. Supported: images, ${supportedTypesLabel()}`;
    }
  }

  /** @param {Event} e */
  async function handleFileSelect(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.files) await processFiles(input.files);
    input.value = '';
  }

  /** @param {DragEvent} e */
  function handleDrop(e) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) processFiles(e.dataTransfer.files);
  }

  /** @param {number} index */
  function removeFile(index) {
    pendingFiles.splice(index, 1);
    pendingFiles = pendingFiles;
  }

  /** @param {number} index */
  function removeImage(index) {
    pendingImages.splice(index, 1);
    pendingImages = pendingImages;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  const hasAttachments = $derived(pendingFiles.length > 0 || pendingImages.length > 0);
</script>

<div
  class="input-area"
  class:drag-over={dragOver}
  ondragover={(e) => { e.preventDefault(); dragOver = true; }}
  ondragleave={() => { dragOver = false; }}
  ondrop={handleDrop}
  role="region"
>
  {#if pendingImages.length > 0}
    <div class="image-list">
      {#each pendingImages as img, i}
        <div class="image-thumb">
          <img src={img.dataUrl} alt={img.name} />
          <button class="image-remove" onclick={() => removeImage(i)} aria-label="Remove {img.name}">
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
          <button class="file-remove" onclick={() => removeFile(i)} aria-label="Remove {file.name}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <form class="input-row" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <button type="button" class="attach-btn" onclick={openFilePicker} aria-label="Attach files" title="Attach files or images">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    </button>

    <textarea
      bind:this={textareaEl}
      bind:value={text}
      onkeydown={handleKeydown}
      oninput={autoResize}
      placeholder="Message Klanker..."
      rows="1"
      disabled={disabled && !loading}
    ></textarea>

    {#if loading}
      <button type="button" class="stop-btn" onclick={onStop} aria-label="Stop generation">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
      </button>
    {:else}
      <button type="submit" class="send-btn" disabled={disabled || (!text.trim() && !hasAttachments)} aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5"/>
          <polyline points="5 12 12 5 19 12"/>
        </svg>
      </button>
    {/if}
  </form>

  <input
    bind:this={fileInputEl}
    type="file"
    multiple
    class="hidden-input"
    onchange={handleFileSelect}
    accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.docx,.xlsx,.xls,.ods,.csv,.tsv,.txt,.md,.json,.xml,.html,.css,.js,.ts,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.sh,.yaml,.yml,.toml,.ini,.sql,.svelte,.vue,.log,.diff,.swift,.kt,.php,.lua,.r"
  />

  {#if parsing}
    <p class="file-status">Parsing file…</p>
  {/if}

  {#if fileError}
    <p class="file-error">{fileError}</p>
  {/if}

  <p class="hint">
    Drop files or <button type="button" class="hint-link" onclick={openFilePicker}>browse</button> to attach · <kbd>Enter</kbd> to send
  </p>
</div>

<style>
  .input-area {
    flex-shrink: 0;
    padding: 16px 24px 12px;
    max-width: 728px;
    margin: 0 auto;
    width: 100%;
    transition: background var(--transition);
  }

  .input-area.drag-over {
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
  }

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

  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 0;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 6px 6px 6px 4px;
    transition: border-color var(--transition);
  }

  .input-row:focus-within {
    border-color: var(--border-light);
  }

  .attach-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    color: var(--text-tertiary);
    flex-shrink: 0;
  }
  .attach-btn:hover { color: var(--text-primary); background: var(--bg-hover); }

  textarea {
    flex: 1;
    resize: none;
    border: none;
    background: transparent;
    padding: 8px 4px;
    font-size: 16px;
    line-height: 1.55;
    outline: none;
    min-height: 20px;
    max-height: 200px;
  }
  textarea::placeholder { color: var(--text-tertiary); }

  .send-btn, .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    flex-shrink: 0;
  }

  .send-btn {
    background: var(--accent);
    color: var(--text-on-accent);
  }
  .send-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .send-btn:disabled { opacity: 0.2; cursor: default; }

  .stop-btn {
    background: var(--text-tertiary);
    color: var(--bg-primary);
  }
  .stop-btn:hover { background: var(--text-secondary); }

  .hidden-input { display: none; }

  .hint {
    text-align: center;
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 8px;
    user-select: none;
  }

  .hint-link {
    color: var(--text-secondary);
    text-decoration: underline;
    font-size: 12px;
    padding: 0;
  }
  .hint-link:hover { color: var(--text-primary); }

  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid var(--border);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .file-status {
    text-align: center;
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 6px;
    animation: pulse-text 1s ease-in-out infinite;
  }

  @keyframes pulse-text {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .file-error {
    text-align: center;
    font-size: 12px;
    color: var(--error);
    margin-top: 6px;
  }

  @media (max-width: 768px) {
    .input-area { padding: 12px 16px 10px; }
  }
</style>
