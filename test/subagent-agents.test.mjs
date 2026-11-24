import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isThinkingLevel, getThinkingArgs } from '../extensions/subagent/thinking.ts';

test('thinking levels are validated against Pi-supported values', () => {
  for (const level of ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) assert.equal(isThinkingLevel(level), true);
  for (const level of ['invalid', '', 1, null, {}, undefined]) assert.equal(isThinkingLevel(level), false);
});

test('CLI thinking argument uses agent override, then inherited session default', () => {
  const defaults = { thinkingLevel: 'medium' };
  assert.deepEqual(getThinkingArgs({ thinkingLevel: 'high' }, defaults), ['--thinking', 'high']);
  assert.deepEqual(getThinkingArgs({}, defaults), ['--thinking', 'medium']);
  assert.deepEqual(getThinkingArgs({ thinkingLevel: 'low' }, {}), ['--thinking', 'low']);
  assert.deepEqual(getThinkingArgs({ model: 'provider/model' }, defaults), []);
});
