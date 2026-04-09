<script>
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import ThinkingBlock from './ThinkingBlock.svelte';
  import MessageAttachments from './MessageAttachments.svelte';
  import MessageSources from './MessageSources.svelte';
  import ToolCall from './ToolCall.svelte';

  /**
   * @type {{
   *   role: string,
   *   content: string,
   *   reasoning?: string,
   *   files?: Array<{name: string, size: number}>,
   *   images?: Array<{name: string, dataUrl: string}>,
   *   sources?: Array<{title: string, url: string}>,
   *   searchQuery?: string,
   *   toolCalls?: Array<object>,
   *   loading?: boolean,
   *   searching?: boolean,
   * }}
   */
  let { role, content, reasoning, files, images, sources, searchQuery, toolCalls, loading = false, searching = false, onapprove, ondeny } = $props();

  const isUser = $derived(role === 'user');
  const isStreaming = $derived(loading || searching);
  const isEmpty = $derived(role === 'assistant' && !content && !searching && !reasoning);
  const showThinking = $derived(!!reasoning);
  const showToolCalls = $derived(toolCalls?.length > 0 && toolCalls.some((tc) => tc.tool !== 'search'));

  marked.setOptions({
    breaks: true,
    gfm: true,
    async: false,
  });

  const CITATION_RE = /\[(\d+)\]/g;

  function linkifyCitations(html, srcs) {
    if (!srcs?.length) return html;
    return html.replace(CITATION_RE, (match, num) => {
      const idx = parseInt(num, 10) - 1;
      const source = srcs[idx];
      if (!source) return match;
      const escaped = source.url.replace(/"/g, '&quot;');
      const title = source.title.replace(/"/g, '&quot;');
      return `<a class="citation" href="${escaped}" target="_blank" rel="noopener noreferrer" title="${title}">${num}</a>`;
    });
  }

  const renderedContent = $derived(
    !isUser && content
      ? linkifyCitations(
          DOMPurify.sanitize(/** @type {string} */ (marked.parse(content))),
          sources,
        )
      : ''
  );
</script>

<div class="message" class:user={isUser} class:assistant={!isUser}>
  <div class="message-inner">
    <div class="role-label">{isUser ? 'You' : 'Assistant'}</div>

    <MessageAttachments {files} {images} />

    {#if showThinking}
      <ThinkingBlock {reasoning} />
    {/if}

    {#if showToolCalls}
      {#each toolCalls.filter((tc) => tc.tool !== 'search') as tc (tc.id)}
        <ToolCall
          toolCall={tc}
          onapprove={(forSession) => onapprove?.(forSession)}
          ondeny={() => ondeny?.()}
        />
      {/each}
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

    <MessageSources {sources} />
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
    max-width: 760px;
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

  .content :global(a.citation) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    margin: 0 1px;
    border-radius: 4px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    text-decoration: none;
    vertical-align: super;
    font-feature-settings: "tnum";
    font-family: var(--font-mono);
    transition: all var(--transition);
  }

  .content :global(a.citation:hover) {
    opacity: 1;
    background: var(--bg-hover);
    border-color: var(--text-tertiary);
    color: var(--text-primary);
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

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .message-inner {
      padding: 0 16px;
    }
  }

  @media (max-width: 320px) {
    .message {
      padding: 16px 0;
    }

    .message-inner {
      padding: 0 10px;
    }

    .content {
      font-size: 14px;
    }
  }

  @media (min-width: 1440px) {
    .message-inner {
      max-width: 820px;
    }
  }
</style>
