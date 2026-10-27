import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParts, groupParts, toolStatus } from '../src/message-parts.ts';

test('preserves commentary and conclusion around tool calls', () => {
  const parts = normalizeParts([
    { type: 'text', text: 'Checking activity.' },
    { type: 'tool-sql_query', toolCallId: 'query-1', state: 'output-available', input: { sql: 'SELECT 1' }, output: [] },
    { type: 'text', text: 'Now checking connections.' },
    { type: 'dynamic-tool', toolName: 'graph_expand', toolCallId: 'graph-1', state: 'output-error', errorText: 'Timed out' },
    { type: 'text', text: 'Evidence is incomplete.' },
  ]);
  assert.deepEqual(groupParts(parts).map(group => group.kind), ['text', 'activity', 'text', 'activity', 'text']);
  assert.equal(parts[1].tool.id, 'query-1');
  assert.equal(parts[3].tool.errorText, 'Timed out');
});

test('groups consecutive analysis and tools without consuming later text', () => {
  const groups = groupParts(normalizeParts([
    { type: 'reasoning', text: 'Checking possible benign explanations.', state: 'streaming' },
    { type: 'step-start' },
    { type: 'tool-rules_run', state: 'input-streaming' },
    { type: 'text', text: 'Conclusion' },
  ]));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].parts.length, 2);
  assert.equal(groups[0].parts[0].streaming, true);
  assert.equal(groups[1].text, 'Conclusion');
});

test('distinguishes approval, denied, failure and completed calls', () => {
  assert.equal(toolStatus('approval-requested'), 'approval');
  assert.equal(toolStatus('output-denied'), 'denied');
  assert.equal(toolStatus('output-error'), 'failed');
  assert.equal(toolStatus('output-available'), 'complete');
  assert.equal(toolStatus('input-available'), 'running');
});

test('does not invent response text for a tool-only message', () => {
  const parts = normalizeParts([{ type: 'tool-sql_query', state: 'input-streaming' }]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].kind, 'tool');
  assert.deepEqual(normalizeParts([{ type: 'text', text: '' }, { type: 'step-start' }]), []);
});
