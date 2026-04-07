<script>
  import { tick } from 'svelte';
  import Message from './Message.svelte';

  /**
   * @type {{
   *   messages: Array<{id: number, role: string, content: string, reasoning?: string, files?: any[], sources?: any[], searchQuery?: string}>,
   *   loading: boolean,
   *   searching: boolean,
   * }}
   */
  let { messages, loading, searching } = $props();

  let container = $state(null);
  let userScrolledUp = $state(false);

  const SCROLL_THRESHOLD = 120;

  function isNearBottom() {
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_THRESHOLD;
  }

  function handleScroll() {
    userScrolledUp = !isNearBottom();
  }

  function scrollToBottom() {
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    userScrolledUp = false;
  }

  const lastContent = $derived(messages.length ? messages[messages.length - 1].content : '');

  $effect(() => {
    void lastContent;
    if (messages.length && container && !userScrolledUp) {
      tick().then(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      });
    }
  });

  const prevMsgCount = $derived(messages.length);
  let lastMsgCount = 0;
  $effect(() => {
    if (prevMsgCount > lastMsgCount && prevMsgCount > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'user') {
        userScrolledUp = false;
        tick().then(() => {
          if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
      }
    }
    lastMsgCount = prevMsgCount;
  });

  const showScrollBtn = $derived(userScrolledUp && messages.length > 0);
</script>

<div class="chat-wrap">
  <div class="chat-scroll" bind:this={container} onscroll={handleScroll}>
    {#if messages.length === 0}
      <div class="welcome">
        <div class="welcome-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </div>
        <h2>How can I help you today?</h2>
        <p>Start a conversation by typing a message below.</p>
      </div>
    {:else}
      <div class="message-list" aria-live="polite" aria-relevant="additions text">
        {#each messages as msg, i (msg.id)}
          <Message
            role={msg.role}
            content={msg.content}
            reasoning={msg.reasoning}
            files={msg.files}
            images={msg.images}
            sources={msg.sources}
            searchQuery={msg.searchQuery}
            loading={loading && i === messages.length - 1}
            searching={searching && i === messages.length - 1}
          />
        {/each}
      </div>
    {/if}
  </div>

  {#if showScrollBtn}
    <button class="scroll-btn" onclick={scrollToBottom} aria-label="Scroll to bottom">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <polyline points="19 12 12 19 5 12"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .chat-wrap {
    flex: 1;
    position: relative;
    min-height: 0;
  }

  .chat-scroll {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .message-list {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .welcome {
    flex: 1;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 24px;
    text-align: center;
  }

  .welcome-icon {
    color: var(--text-tertiary);
    opacity: 0.5;
    margin-bottom: 4px;
  }

  .welcome h2 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    margin: 0;
  }

  .welcome p {
    font-size: 16px;
    color: var(--text-tertiary);
    margin: 0;
  }

  .scroll-btn {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
    z-index: 10;
  }

  .scroll-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--text-tertiary);
  }
</style>
