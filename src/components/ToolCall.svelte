<script>
  /**
   * @type {{
   *   toolCall: {
   *     id: string,
   *     tool: string,
   *     params: object,
   *     status: string,
   *     output?: string,
   *     error?: string,
   *     duration?: number,
   *   },
   *   onapprove?: (forSession: boolean) => void,
   *   ondeny?: () => void,
   * }}
   */
  let { toolCall, onapprove, ondeny } = $props();

  let outputOpen = $state(false);

  const isSearch = $derived(toolCall.tool === 'search');
  const isPending = $derived(toolCall.status === 'pending');
  const isRunning = $derived(toolCall.status === 'running');
  const isCompleted = $derived(toolCall.status === 'completed');
  const isDenied = $derived(toolCall.status === 'denied');
  const isFailed = $derived(toolCall.status === 'failed');

  const statusLabel = $derived(
    isPending ? 'Awaiting approval' :
    isRunning ? 'Running…' :
    isCompleted ? `Completed${toolCall.duration ? ` (${toolCall.duration}ms)` : ''}` :
    isDenied ? 'Denied' :
    isFailed ? 'Failed' : toolCall.status
  );

  const paramDisplay = $derived(
    toolCall.tool === 'shell' ? toolCall.params.cmd :
    toolCall.tool === 'read_file' ? toolCall.params.path :
    toolCall.tool === 'search' ? toolCall.params.query :
    JSON.stringify(toolCall.params)
  );

  const hasOutput = $derived(!!(toolCall.output || toolCall.error));
</script>

{#if !isSearch}
  <div class="tool-call" class:pending={isPending} class:running={isRunning} class:completed={isCompleted} class:denied={isDenied} class:failed={isFailed}>
    <div class="tool-header">
      <div class="tool-info">
        <span class="tool-name">{toolCall.tool}</span>
        <code class="tool-param">{paramDisplay}</code>
      </div>
      <span class="tool-status">{statusLabel}</span>
    </div>

    {#if isPending}
      <div class="tool-actions">
        <button class="btn-approve" onclick={() => onapprove?.(false)}>Allow once</button>
        <button class="btn-approve-session" onclick={() => onapprove?.(true)}>Allow for session</button>
        <button class="btn-deny" onclick={() => ondeny?.()}>Deny</button>
      </div>
    {/if}

    {#if hasOutput && !isPending}
      <button class="output-toggle" onclick={() => { outputOpen = !outputOpen; }}>
        <svg class="output-chevron" class:open={outputOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        {isFailed ? 'Error' : 'Output'}
      </button>

      {#if outputOpen}
        <pre class="tool-output" class:error-output={isFailed}>{toolCall.error || toolCall.output}</pre>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .tool-call {
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .tool-call.pending {
    border-color: rgba(255, 200, 50, 0.2);
  }

  .tool-call.failed, .tool-call.denied {
    border-color: rgba(255, 68, 68, 0.15);
  }

  .tool-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: var(--bg-tertiary);
  }

  .tool-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .tool-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .tool-param {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 1px 6px;
    background: var(--bg-primary);
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .tool-status {
    font-size: 12px;
    color: var(--text-tertiary);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .pending .tool-status { color: #f0c040; }
  .running .tool-status { color: var(--accent); }
  .completed .tool-status { color: var(--success); }
  .failed .tool-status, .denied .tool-status { color: var(--error); }

  .tool-actions {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
  }

  .btn-approve, .btn-approve-session, .btn-deny {
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    border-radius: var(--radius-sm);
    transition: all var(--transition);
  }

  .btn-approve {
    background: var(--success);
    color: #000;
  }

  .btn-approve:hover {
    opacity: 0.85;
  }

  .btn-approve-session {
    background: var(--bg-hover);
    color: var(--text-secondary);
    border: 1px solid var(--border-light);
  }

  .btn-approve-session:hover {
    color: var(--text-primary);
    border-color: var(--text-tertiary);
  }

  .btn-deny {
    background: var(--error-bg);
    color: var(--error);
  }

  .btn-deny:hover {
    opacity: 0.85;
  }

  .output-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-tertiary);
    background: transparent;
    text-align: left;
    border-top: 1px solid var(--border);
  }

  .output-toggle:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
  }

  .output-chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform var(--transition);
  }

  .output-chevron.open {
    transform: rotate(180deg);
  }

  .tool-output {
    padding: 10px 12px;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    border-top: 1px solid var(--border);
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-primary);
  }

  .error-output {
    color: var(--error);
  }
</style>
