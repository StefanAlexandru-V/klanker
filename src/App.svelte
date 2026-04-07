<script>
  import Sidebar from './components/Sidebar.svelte';
  import Chat from './components/Chat.svelte';
  import Input from './components/Input.svelte';
  import ModelSelector from './components/ModelSelector.svelte';
  import { createChatStore } from './lib/store.svelte.js';

  const chat = createChatStore();

  let sidebarOpen = $state(true);
  let mobileOverlay = $state(false);

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    if (window.innerWidth <= 768) {
      mobileOverlay = sidebarOpen;
    }
  }

  function closeSidebar() {
    sidebarOpen = false;
    mobileOverlay = false;
  }

  function handleNewChat() {
    chat.newConversation();
    if (window.innerWidth <= 768) closeSidebar();
  }

  function handleSelect(id) {
    chat.switchConversation(id);
    if (window.innerWidth <= 768) closeSidebar();
  }
</script>

{#if mobileOverlay}
  <button class="overlay" onclick={closeSidebar} aria-label="Close sidebar"></button>
{/if}

<div class="layout">
  {#if sidebarOpen}
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
  {/if}

  <main class="main">
    <header>
      {#if !sidebarOpen}
        <button class="menu-btn" onclick={toggleSidebar} aria-label="Open sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      {/if}

      <div class="header-center">
        <ModelSelector
          models={chat.models}
          selectedModel={chat.selectedModel}
          modelsLoading={chat.modelsLoading}
          onSelect={(id) => chat.setModel(id)}
          onRefresh={() => chat.refreshModels()}
        />
      </div>

      <button class="new-btn" onclick={handleNewChat} aria-label="New chat" title="New chat">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>
    </header>

    {#if chat.error}
      <div class="error-bar">
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

    <Chat messages={chat.activeMessages} loading={chat.loading} searching={chat.searching} />
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

  .menu-btn, .new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .menu-btn:hover, .new-btn:hover {
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
</style>
