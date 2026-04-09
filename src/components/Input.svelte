<script>
  import { processFiles } from '../lib/fileHandler.js';
  import FileAttachments from './FileAttachments.svelte';

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

  function handleSubmit() {
    if (loading) { onStop(); return; }
    if ((!text.trim() && pendingFiles.length === 0 && pendingImages.length === 0) || disabled) return;
    onSend(text, [...pendingFiles], [...pendingImages]);
    text = '';
    pendingFiles = [];
    pendingImages = [];
    fileError = '';
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  $effect(() => {
    void text;
    if (textareaEl) autoResize();
  });

  function autoResize() {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
  }

  function openFilePicker() {
    fileInputEl?.click();
  }

  /** @param {FileList} fileList */
  async function handleFiles(fileList) {
    fileError = '';
    parsing = true;
    try {
      const result = await processFiles(fileList, pendingFiles, pendingImages);
      pendingFiles = result.files;
      pendingImages = result.images;
      fileError = result.error;
    } finally {
      parsing = false;
    }
  }

  /** @param {Event} e */
  async function handleFileSelect(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.files) await handleFiles(input.files);
    input.value = '';
  }

  /** @param {DragEvent} e */
  function handleDrop(e) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
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
  <FileAttachments {pendingFiles} {pendingImages} onRemoveFile={removeFile} onRemoveImage={removeImage} />

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
      aria-label="Message input"
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
    max-width: 808px;
    margin: 0 auto;
    width: 100%;
    transition: background var(--transition);
  }

  .input-area.drag-over {
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
  }

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

  @media (max-width: 320px) {
    .input-area { padding: 8px 10px 8px; }
    textarea { font-size: 14px; }
    .hint { font-size: 11px; }
  }

  @media (min-width: 1440px) {
    .input-area { max-width: 868px; }
  }
</style>
