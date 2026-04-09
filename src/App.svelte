<script>
  import Sidebar from './components/Sidebar.svelte';
  import Chat from './components/Chat.svelte';
  import Input from './components/Input.svelte';
  import ModelSelector from './components/ModelSelector.svelte';
  import { createChatStore } from './lib/store.svelte.js';

  const chat = createChatStore();

  const initialMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  let isMobile = $state(initialMobile);
  let sidebarOpen = $state(!initialMobile);

  $effect(() => {
    function onResize() {
      const nowMobile = window.innerWidth <= 768;
      if (nowMobile !== isMobile) {
        isMobile = nowMobile;
        if (nowMobile) sidebarOpen = false;
      }
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function closeSidebar() {
    if (isMobile) sidebarOpen = false;
  }

  function handleNewChat() {
    chat.newConversation();
    closeSidebar();
  }

  async function handleExport() {
    const md = chat.exportRawLog();
    if (!md) return;
    const title = chat.activeConversation?.title || 'conversation';
    const slug = title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${ts}_${slug}.md`;

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: md }),
      });
      const data = await res.json();
      if (data.ok) {
        console.log(`Log exported: ${data.path}`);
      }
    } catch {
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function handleSelect(id) {
    chat.switchConversation(id);
    closeSidebar();
  }
</script>

<a class="skip-link" href="#main-content">Skip to content</a>

{#if isMobile && sidebarOpen}
  <button class="overlay" onclick={() => { sidebarOpen = false; }} aria-label="Close sidebar"></button>
{/if}

<div class="layout">
  <div class="sidebar-rail" class:open={sidebarOpen}>
    <Sidebar
      conversations={chat.filteredConversations}
      activeConvId={chat.activeConvId}
      bind:searchQuery={chat.searchQuery}
      onNewChat={handleNewChat}
      onSelect={handleSelect}
      onDelete={(id) => chat.deleteConversation(id)}
      onRename={(id, t) => chat.renameConversation(id, t)}
      onClose={toggleSidebar}
    />
  </div>

  <main class="main" id="main-content">
    <header>
      <button class="menu-btn" onclick={toggleSidebar} aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}>
        {#if sidebarOpen}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        {/if}
      </button>

      <div class="header-center">
        <ModelSelector
          models={chat.models}
          selectedModel={chat.selectedModel}
          modelsLoading={chat.modelsLoading}
          onSelect={(id) => chat.setModel(id)}
          onRefresh={() => chat.refreshModels()}
        />
      </div>

      <button class="export-btn" onclick={handleExport} aria-label="Export conversation log" title="Export log">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>

      <button class="new-btn" onclick={handleNewChat} aria-label="New chat" title="New chat">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>
    </header>

    {#if chat.error}
      <div class="error-bar" role="alert">
        <div class="error-content">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{chat.error}</span>
        </div>
        <button class="dismiss" onclick={() => chat.dismissError()} aria-label="Dismiss error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    {/if}

    <Chat
      messages={chat.activeMessages}
      loading={chat.loading}
      searching={chat.searching}
      onapprove={(forSession) => chat.resolveToolApproval(true, forSession)}
      ondeny={() => chat.resolveToolApproval(false)}
    />
    <Input
      onSend={(msg, files, images) => chat.send(msg, files, images)}
      disabled={!chat.selectedModel}
      loading={chat.loading}
      onStop={() => chat.stopGeneration()}
    />
  </main>
</div>

<style>
  .layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 99;
    border: none;
    cursor: default;
  }

  .sidebar-rail {
    width: 0;
    overflow: hidden;
    flex-shrink: 0;
    transition: width 200ms ease;
  }

  .sidebar-rail.open {
    width: 280px;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 8px;
    min-height: 52px;
  }

  .header-center {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .menu-btn, .new-btn, .export-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .menu-btn:hover, .new-btn:hover, .export-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .error-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 20px;
    background: var(--error-bg);
    border-bottom: 1px solid rgba(255, 68, 68, 0.15);
    flex-shrink: 0;
  }

  .error-content {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--error);
    font-size: 13px;
  }

  .dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--error);
    opacity: 0.6;
  }
  .dismiss:hover {
    opacity: 1;
    background: rgba(255, 68, 68, 0.1);
  }

  .skip-link {
    position: absolute;
    left: -9999px;
    top: 0;
    z-index: 200;
    padding: 8px 16px;
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 14px;
    font-weight: 500;
    border-radius: 0 0 var(--radius) var(--radius);
    text-decoration: none;
  }

  .skip-link:focus {
    left: 50%;
    transform: translateX(-50%);
  }

  @media (max-width: 768px) {
    .sidebar-rail {
      position: fixed;
      top: 0;
      left: 0;
      height: 100%;
      z-index: 100;
      width: 0;
    }

    .sidebar-rail.open {
      width: 300px;
    }
  }

  @media (max-width: 320px) {
    header {
      padding: 6px 8px;
      min-height: 44px;
      gap: 4px;
    }

    .menu-btn, .new-btn, .export-btn {
      width: 32px;
      height: 32px;
    }
  }
</style>
