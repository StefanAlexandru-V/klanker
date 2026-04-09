/**
 * Tool usage tests — validates the model uses tools correctly,
 * learns from errors, uses exact paths, and handles cwd.
 *
 * These tests are derived from real failures observed in production.
 */

import {
  assertContains,
  assertNotContains,
  assertToolUsed,
  assertToolParam,
  assertNoHallucination,
  assertMatches,
} from '../runner.js';

export default [
  {
    name: 'uses correct path from ls output',
    description: 'Model should use the exact directory name returned by ls, never fabricate names',
    turns: [
      "What's in my Projects folder?",
      'How many JavaScript files are in the klanker project?',
    ],
    assertions: [
      // Turn 1: should use ls and report exact names
      (result) => [
        assertToolUsed('uses shell tool', result.toolCalls, 'shell'),
        assertContains('mentions klanker', result.response, 'klanker'),
      ],
      // Turn 2: should use ~/Projects/klanker — the EXACT path from turn 1
      (result) => {
        const shellCalls = result.toolCalls.filter(tc => tc.tool === 'shell');
        const usedCorrectPath = shellCalls.some(tc => {
          const cmd = tc.params.cmd || '';
          const cwd = tc.params.cwd || '';
          return cmd.includes('Projects/klanker') || cwd.includes('Projects/klanker');
        });
        return [
          assertToolUsed('uses shell tool', result.toolCalls, 'shell'),
          { pass: usedCorrectPath, name: 'uses exact path from ls output', detail: usedCorrectPath ? undefined : `Shell calls: ${JSON.stringify(shellCalls.map(tc => tc.params))}` },
          assertNoHallucination('no fabricated paths', result.response, ['klanker_', 'klanker-', 'Klanker_']),
        ];
      },
    ],
  },

  {
    name: 'uses cwd parameter for project-scoped commands',
    description: 'When user asks to run a command in a specific project, model should use cwd param',
    turns: [
      'Run npm list in my klanker project at ~/Projects/klanker',
    ],
    assertions: [
      (result) => {
        const shellCalls = result.toolCalls.filter(tc => tc.tool === 'shell');
        const usedCwd = shellCalls.some(tc => tc.params.cwd && tc.params.cwd.includes('klanker'));
        const usedCdFallback = shellCalls.some(tc => (tc.params.cmd || '').includes('cd ') && (tc.params.cmd || '').includes('klanker'));
        return [
          assertToolUsed('uses shell', result.toolCalls, 'shell'),
          { pass: usedCwd || usedCdFallback, name: 'uses cwd or cd to project dir', detail: usedCwd || usedCdFallback ? undefined : `Shell calls: ${JSON.stringify(shellCalls.map(tc => tc.params))}` },
        ];
      },
    ],
  },

  {
    name: 'remembers cwd across turns',
    description: 'When user says "same spot" or "there", model should reuse previous cwd',
    turns: [
      'Run npm list in ~/Projects/klanker',
      'Now run npm outdated in the same spot',
    ],
    assertions: [
      null, // Skip turn 1 assertions
      (result) => {
        const shellCalls = result.toolCalls.filter(tc => tc.tool === 'shell');
        const usedKlankerPath = shellCalls.some(tc => {
          const cmd = tc.params.cmd || '';
          const cwd = tc.params.cwd || '';
          return cwd.includes('klanker') || cmd.includes('klanker');
        });
        return [
          assertToolUsed('uses shell', result.toolCalls, 'shell'),
          { pass: usedKlankerPath, name: 'reuses cwd from previous turn', detail: usedKlankerPath ? undefined : `Shell calls: ${JSON.stringify(shellCalls.map(tc => tc.params))}` },
        ];
      },
    ],
  },

  {
    name: 'recovers from wrong path by listing directory',
    description: 'When a path fails, model should ls to discover the correct path instead of guessing',
    turns: [
      'List all files in ~/Projects/klankerr',  // deliberate typo
    ],
    assertions: [
      (result) => {
        const shellCalls = result.toolCalls.filter(tc => tc.tool === 'shell');
        // The first call will fail. Model should then ls ~/Projects to find real name.
        const recoveredWithLs = shellCalls.length >= 2 && shellCalls.some(tc => {
          const cmd = tc.params.cmd || '';
          return cmd.includes('ls') && (cmd.includes('Projects') || cmd.includes('~'));
        });
        return [
          { pass: shellCalls.length >= 2, name: 'makes multiple tool calls (recovery)', detail: `Made ${shellCalls.length} shell calls` },
          { pass: recoveredWithLs, name: 'uses ls to discover correct path', detail: recoveredWithLs ? undefined : `Shell calls: ${JSON.stringify(shellCalls.map(tc => tc.params))}` },
        ];
      },
    ],
  },

  {
    name: 'never fabricates directory names',
    description: 'Model must not invent directory names that were never in tool output',
    turns: [
      "What's in my Projects folder?",
    ],
    multiTurnAssertions: (results) => {
      const allResponses = results.map(r => r.response).join(' ');
      const allToolOutputs = results.flatMap(r => r.toolCalls.map(tc => tc.output || '')).join(' ');
      return [
        assertNoHallucination('no fabricated dirs', allResponses, ['klanker_', 'projects_', 'Project_']),
        assertToolUsed('actually lists directory', results[0].toolCalls, 'shell'),
      ];
    },
  },

  {
    name: 'reads file with read_file tool',
    description: 'Uses read_file for reading file contents instead of cat',
    turns: [
      'Read the file ~/Projects/klanker/package.json',
    ],
    assertions: [
      (result) => {
        const usedReadFile = result.toolCalls.some(tc => tc.tool === 'read_file');
        const usedCat = result.toolCalls.some(tc => tc.tool === 'shell' && (tc.params.cmd || '').includes('cat'));
        return [
          { pass: usedReadFile || usedCat, name: 'reads the file', detail: `Tools used: ${result.toolCalls.map(tc => tc.tool).join(', ')}` },
          assertContains('mentions package.json content', result.response, 'klanker'),
        ];
      },
    ],
  },
];
