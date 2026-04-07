<script>
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  /**
   * @type {{
   *   role: string,
   *   content: string,
   *   reasoning?: string,
   *   files?: Array<{name: string, size: number}>,
   *   images?: Array<{name: string, dataUrl: string}>,
   *   sources?: Array<{title: string, url: string}>,
   *   searchQuery?: string,
   *   loading?: boolean,
   *   searching?: boolean,
   * }}
   */
  let { role, content, reasoning, files, images, sources, searchQuery, loading = false, searching = false } = $props();

  const isUser = $derived(role === 'user');
  const isStreaming = $derived(loading || searching);
  const isEmpty = $derived(role === 'assistant' && !content && !searching);
  const showThinking = $derived(reasoning && !isStreaming);

  marked.setOptions({
    breaks: true,
    gfm: true,
    async: false,
  });

  const renderedContent = $derived(
    !isUser && content ? DOMPurify.sanitize(/** @type {string} */ (marked.parse(content))) : ''
  );

  let thinkingOpen = $state(false);

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
</script>

<div class="message" class:user={isUser} class:assistant={!isUser}>
  <div class="message-inner">
    <div class="role-label">{isUser ? 'You' : 'Assistant'}</div>

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

    {#if showThinking}
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
    {/if}

    <div class="content">
      {#if searching}
        <div class="search-status">
          <svg class="search-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Searching the web…
        </div>
      {:else if isEmpty}
        <div class="dots">
          <span></span><span></span><span></span>
        </div>
      {:else if isUser}
        {content}
      {:else}
        {@html renderedContent}
      {/if}
    </div>

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
  </div>
</div>

<style>
  .message {
    padding: 24px 0;
    border-bottom: 1px solid var(--border);
  }

  .message:last-child {
    border-bottom: none;
  }

  .message-inner {
    max-width: 680px;
    margin: 0 auto;
    padding: 0 24px;
  }

  .role-label {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--text-primary);
  }

  .content {
    font-size: 16px;
    line-height: 1.75;
    color: var(--text-primary);
    word-break: break-word;
  }

  .user .content {
    color: var(--text-secondary);
    white-space: pre-wrap;
  }

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

  .content :global(p) {
    margin: 0 0 12px;
  }

  .content :global(p:last-child) {
    margin-bottom: 0;
  }

  .content :global(h1),
  .content :global(h2),
  .content :global(h3),
  .content :global(h4) {
    margin: 20px 0 8px;
    color: var(--text-primary);
    font-weight: 700;
    line-height: 1.3;
  }

  .content :global(h1) { font-size: 1.5em; }
  .content :global(h2) { font-size: 1.3em; }
  .content :global(h3) { font-size: 1.15em; }
  .content :global(h4) { font-size: 1em; }

  .content :global(h1:first-child),
  .content :global(h2:first-child),
  .content :global(h3:first-child) {
    margin-top: 0;
  }

  .content :global(strong) {
    font-weight: 700;
    color: var(--text-primary);
  }

  .content :global(em) {
    font-style: italic;
  }

  .content :global(a) {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .content :global(a:hover) {
    opacity: 0.8;
  }

  .content :global(ul),
  .content :global(ol) {
    margin: 8px 0 12px;
    padding-left: 24px;
  }

  .content :global(li) {
    margin-bottom: 4px;
  }

  .content :global(li p) {
    margin: 0;
  }

  .content :global(blockquote) {
    margin: 12px 0;
    padding: 8px 16px;
    border-left: 3px solid var(--border-light);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .content :global(blockquote p) {
    margin: 0;
  }

  .content :global(code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    padding: 2px 6px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
  }

  .content :global(pre) {
    margin: 12px 0;
    padding: 14px 16px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow-x: auto;
  }

  .content :global(pre code) {
    padding: 0;
    background: none;
    border: none;
    border-radius: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 14px;
  }

  .content :global(th),
  .content :global(td) {
    padding: 8px 12px;
    border: 1px solid var(--border);
    text-align: left;
  }

  .content :global(th) {
    background: var(--bg-tertiary);
    font-weight: 600;
    color: var(--text-primary);
  }

  .content :global(td) {
    color: var(--text-secondary);
  }

  .content :global(tr:hover td) {
    background: var(--bg-tertiary);
  }

  .content :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 16px 0;
  }

  .content :global(img) {
    max-width: 100%;
    border-radius: var(--radius);
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

  .dots {
    display: flex;
    gap: 4px;
    padding: 4px 0;
  }

  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-tertiary);
    animation: bounce 1.4s ease-in-out infinite;
  }

  .dots span:nth-child(2) { animation-delay: 0.16s; }
  .dots span:nth-child(3) { animation-delay: 0.32s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  .search-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-secondary);
    padding: 4px 0;
  }

  .search-spinner {
    animation: spin 2s linear infinite;
    color: var(--success);
  }

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

  @media (max-width: 768px) {
    .message-inner {
      padding: 0 16px;
    }
  }
</style>
