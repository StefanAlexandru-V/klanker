import { describe, it, expect } from 'vitest';
import { parseTool, hasToolDirective, hasIncompleteDirective, buildToolPrompt } from '../lib/tools.js';

describe('parseTool', () => {
  it('parses [TOOL: shell {"cmd": "ls"}]', () => {
    const result = parseTool('[TOOL: shell {"cmd": "ls"}]');
    expect(result).toEqual({ tool: 'shell', params: { cmd: 'ls' } });
  });

  it('parses [TOOL: search {"query": "test"}]', () => {
    const result = parseTool('[TOOL: search {"query": "test query"}]');
    expect(result).toEqual({ tool: 'search', params: { query: 'test query' } });
  });

  it('parses [TOOL: read_file {"path": "~/.bashrc"}]', () => {
    const result = parseTool('[TOOL: read_file {"path": "~/.bashrc"}]');
    expect(result).toEqual({ tool: 'read_file', params: { path: '~/.bashrc' } });
  });

  it('parses [TOOL: shell {"cmd": "ls", "cwd": "~/Projects"}]', () => {
    const result = parseTool('[TOOL: shell {"cmd": "ls", "cwd": "~/Projects"}]');
    expect(result).toEqual({ tool: 'shell', params: { cmd: 'ls', cwd: '~/Projects' } });
  });

  it('handles [SEARCH: query] backwards compat', () => {
    const result = parseTool('[SEARCH: latest news]');
    expect(result).toEqual({ tool: 'search', params: { query: 'latest news' } });
  });

  it('handles incomplete [TOOL: shell {"cmd": "ls"} (missing ])', () => {
    const result = parseTool('[TOOL: shell {"cmd": "ls"}');
    expect(result).toEqual({ tool: 'shell', params: { cmd: 'ls' } });
  });

  it('handles incomplete [TOOL: shell {"cmd": "ls" (missing } and ])', () => {
    const result = parseTool('[TOOL: shell {"cmd": "ls"');
    expect(result).toEqual({ tool: 'shell', params: { cmd: 'ls' } });
  });

  it('handles incomplete [SEARCH: query (missing ])', () => {
    const result = parseTool('[SEARCH: james webb nebula');
    expect(result).toEqual({ tool: 'search', params: { query: 'james webb nebula' } });
  });

  it('returns null for normal text', () => {
    expect(parseTool('just a normal response')).toBeNull();
    expect(parseTool('Hello, how can I help you?')).toBeNull();
  });

  it('returns null for empty/null input', () => {
    expect(parseTool('')).toBeNull();
    expect(parseTool(null)).toBeNull();
    expect(parseTool(undefined)).toBeNull();
  });

  it('handles directive with surrounding whitespace', () => {
    const result = parseTool('  [TOOL: shell {"cmd": "echo hi"}]  ');
    expect(result).toEqual({ tool: 'shell', params: { cmd: 'echo hi' } });
  });

  it('handles text before directive (model leaked thinking)', () => {
    const result = parseTool('Thinking about it...\n[TOOL: shell {"cmd": "ls"}]');
    expect(result).toEqual({ tool: 'shell', params: { cmd: 'ls' } });
  });
});

describe('hasToolDirective', () => {
  it('detects complete [TOOL:] directives', () => {
    expect(hasToolDirective('[TOOL: shell {"cmd": "ls"}]')).toBe(true);
  });

  it('detects complete [SEARCH:] directives', () => {
    expect(hasToolDirective('[SEARCH: test]')).toBe(true);
  });

  it('detects incomplete directives', () => {
    expect(hasToolDirective('[TOOL: shell {"cmd":')).toBe(true);
    expect(hasToolDirective('[SEARCH: test')).toBe(true);
  });

  it('returns false for normal text', () => {
    expect(hasToolDirective('normal text')).toBe(false);
    expect(hasToolDirective('')).toBe(false);
    expect(hasToolDirective(null)).toBe(false);
  });
});

describe('hasIncompleteDirective', () => {
  it('detects incomplete [TOOL: without ]', () => {
    expect(hasIncompleteDirective('[TOOL: shell {"cmd": "ls"')).toBe(true);
  });

  it('detects incomplete [SEARCH: without ]', () => {
    expect(hasIncompleteDirective('[SEARCH: test query')).toBe(true);
  });

  it('returns false for complete directives', () => {
    expect(hasIncompleteDirective('[TOOL: shell {"cmd": "ls"}]')).toBe(false);
    expect(hasIncompleteDirective('[SEARCH: test]')).toBe(false);
  });

  it('returns false for normal text', () => {
    expect(hasIncompleteDirective('normal text')).toBe(false);
  });
});

describe('buildToolPrompt', () => {
  const mockTools = [
    {
      name: 'search',
      description: 'Search the web',
      params: { query: { type: 'string', description: 'Search keywords' } },
    },
    {
      name: 'shell',
      description: 'Run a shell command',
      params: {
        cmd: { type: 'string', description: 'Shell command' },
        cwd: { type: 'string', description: 'Working directory', optional: true },
      },
    },
  ];

  it('builds a prompt string with all tools', () => {
    const prompt = buildToolPrompt(mockTools);
    expect(prompt).toContain('search');
    expect(prompt).toContain('shell');
    expect(prompt).toContain('[TOOL: tool_name');
    expect(prompt).toContain('How to use a tool');
  });

  it('includes parameter descriptions', () => {
    const prompt = buildToolPrompt(mockTools);
    expect(prompt).toContain('Search keywords');
    expect(prompt).toContain('Shell command');
    expect(prompt).toContain('(optional)');
  });

  it('returns empty string for no tools', () => {
    expect(buildToolPrompt([])).toBe('');
    expect(buildToolPrompt(null)).toBe('');
  });
});
