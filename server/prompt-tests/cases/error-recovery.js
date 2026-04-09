/**
 * Error recovery tests — validates the model handles tool failures
 * gracefully and doesn't repeat mistakes.
 */

import {
  assertContains,
  assertNotContains,
  assertToolUsed,
  assertNoHallucination,
} from '../runner.js';

export default [
  {
    name: 'handles missing command gracefully',
    description: 'When a command is not found, model should say so instead of retrying blindly',
    turns: ['What version of rustc is installed?'],
    assertions: [
      (result) => {
        const shellCalls = result.toolCalls.filter(tc => tc.tool === 'shell');
        // Should try rustc --version, get "not found", and tell user
        return [
          assertToolUsed('uses shell', result.toolCalls, 'shell'),
          assertContains('reports not installed', result.response.toLowerCase(), 'not'),
          // Should not retry the same failing command more than once
          {
            pass: shellCalls.filter(tc => (tc.params.cmd || '').includes('rustc')).length <= 2,
            name: 'does not retry same failing command excessively',
            detail: `rustc calls: ${shellCalls.filter(tc => (tc.params.cmd || '').includes('rustc')).length}`,
          },
        ];
      },
    ],
  },

  {
    name: 'does not hallucinate after errors',
    description: 'After a tool error, model should not make up data',
    turns: [
      'How many Python files are in ~/Projects/nonexistent-project?',
    ],
    assertions: [
      (result) => [
        assertToolUsed('tries the command', result.toolCalls, 'shell'),
        assertNoHallucination('no made-up numbers', result.response, [
          /(?:there (?:are|were) |contains? |found )\d{2,}/i,  // "there are 42 files"
        ]),
        assertContains('acknowledges failure', result.response.toLowerCase(), 'not'),
      ],
    ],
  },

  {
    name: 'adapts path after error',
    description: 'When user gives a wrong path, model should discover the right one',
    turns: [
      'List files in ~/projects/klanker',  // wrong case — should be ~/Projects
    ],
    assertions: [
      (result) => {
        const shellCalls = result.toolCalls.filter(tc => tc.tool === 'shell');
        // After first fail, should try to discover correct path
        const triedDiscovery = shellCalls.some(tc => {
          const cmd = tc.params.cmd || '';
          return cmd.includes('ls ~') || cmd.includes('ls $HOME') || cmd.includes('ls /home');
        });
        const usedCorrectPath = shellCalls.some(tc => {
          const cmd = tc.params.cmd || '';
          const cwd = tc.params.cwd || '';
          return cmd.includes('~/Projects') || cwd.includes('Projects');
        });
        return [
          { pass: shellCalls.length >= 2, name: 'recovers from error (multiple attempts)', detail: `Made ${shellCalls.length} shell calls` },
          { pass: triedDiscovery || usedCorrectPath, name: 'discovers correct path or reports error clearly', detail: `Discovery: ${triedDiscovery}, Correct path: ${usedCorrectPath}` },
        ];
      },
    ],
  },

  {
    name: 'uses tool output verbatim for numbers',
    description: 'When reporting counts from tool output, should use the exact number',
    turns: [
      'How many lines are in ~/Projects/klanker/package.json?',
    ],
    assertions: [
      (result) => {
        const shellCalls = result.toolCalls.filter(tc => tc.tool === 'shell');
        // Get the number from the tool output
        const wcCall = shellCalls.find(tc => tc.ok && tc.output);
        const outputNum = wcCall?.output?.match(/(\d+)/)?.[1];

        if (!outputNum) {
          return [{ pass: false, name: 'got a number from tool', detail: 'No successful tool call with numeric output' }];
        }

        return [
          assertContains('reports exact number from output', result.response, outputNum),
        ];
      },
    ],
  },
];
