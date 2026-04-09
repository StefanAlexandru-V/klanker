/**
 * Response quality tests — validates the model's conversational behaviour,
 * personality, accuracy, and formatting.
 */

import {
  assertContains,
  assertNotContains,
  assertResponseLength,
  assertMatches,
} from '../runner.js';

export default [
  {
    name: 'concise answer to simple question',
    description: 'Simple factual questions should get short answers',
    turns: ["What's 2+2?"],
    assertions: [
      (result) => [
        assertContains('contains 4', result.response, '4'),
        assertResponseLength('short response', result.response, { max: 100 }),
      ],
    ],
  },

  {
    name: 'has opinions on subjective topics',
    description: 'Should not hide behind "as an AI" disclaimers on opinion questions',
    turns: ['What do you think about the trolley problem?'],
    assertions: [
      (result) => [
        assertNotContains('no "as an AI" disclaimer', result.response, 'as an ai'),
        assertNotContains('no "I dont have beliefs"', result.response, "don't have personal beliefs"),
        assertNotContains('no "I lack feelings"', result.response, 'lack the capacity'),
        assertResponseLength('substantial response', result.response, { min: 100 }),
      ],
    ],
  },

  {
    name: 'no flattery openings',
    description: 'Should not start with "Great question!" or similar',
    turns: ['Can you explain quantum computing?'],
    assertions: [
      (result) => [
        assertNotContains('no great question', result.response, 'great question'),
        assertNotContains('no excellent point', result.response, 'excellent point'),
        assertNotContains('no good question', result.response, 'good question'),
        assertNotContains('no thats a great', result.response, "that's a great"),
      ],
    ],
  },

  {
    name: 'uses markdown for technical content',
    description: 'Technical explanations should use proper markdown formatting',
    turns: ['Explain the differences between TCP and UDP'],
    assertions: [
      (result) => {
        const hasMd = result.response.includes('**') || result.response.includes('##')
          || result.response.includes('- ') || result.response.includes('* ')
          || result.response.includes('|');
        return [
          { pass: hasMd, name: 'uses markdown formatting', detail: hasMd ? undefined : 'No markdown found in technical response' },
          assertResponseLength('thorough response', result.response, { min: 200 }),
        ];
      },
    ],
  },

  {
    name: 'plain prose for casual chat',
    description: 'Casual conversation should not use excessive markdown',
    turns: ['Hey, how are you doing today?'],
    assertions: [
      (result) => [
        assertResponseLength('short casual response', result.response, { max: 300 }),
      ],
    ],
  },

  {
    name: 'matches user tone',
    description: 'Should match informal tone when user is casual',
    turns: ['yo whats good, whats the capital of france lol'],
    assertions: [
      (result) => [
        assertContains('answers correctly', result.response, 'Paris'),
        assertResponseLength('keeps it brief', result.response, { max: 200 }),
      ],
    ],
  },

  {
    name: 'does not use tools for simple knowledge questions',
    description: 'Basic knowledge questions should be answered directly without tools',
    turns: ["What's the capital of Japan?"],
    assertions: [
      (result) => [
        assertContains('answers correctly', result.response, 'Tokyo'),
        { pass: result.toolCalls.length === 0, name: 'no tool calls needed', detail: result.toolCalls.length === 0 ? undefined : `Unnecessary tool calls: ${result.toolCalls.map(tc => tc.tool).join(', ')}` },
      ],
    ],
  },
];
