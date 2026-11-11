import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AgentSession,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import { PiRuntimeSession } from '../src/runtime/pi/pi-session.js';
import type { RuntimeEvent } from '../src/runtime/types.js';

test('tool lifecycle follows actual execution instead of model argument parsing', () => {
  let emit: ((event: AgentSessionEvent) => void) | undefined;
  const sdk = {
    sessionId: 'session',
    subscribe: (fn: (event: AgentSessionEvent) => void) => {
      emit = fn;
      return () => {};
    },
    dispose: () => {},
  } as unknown as AgentSession;
  const session = new PiRuntimeSession(sdk);
  const events: RuntimeEvent[] = [];
  session.subscribe((event) => events.push(event));
  emit!({
    type: 'message_update',
    assistantMessageEvent: {
      type: 'toolcall_start',
      partial: {
        content: [
          { type: 'toolCall', id: 'call', name: 'read', arguments: {} },
        ],
      },
    },
  } as unknown as AgentSessionEvent);
  emit!({
    type: 'message_update',
    assistantMessageEvent: {
      type: 'toolcall_end',
      toolCall: { id: 'call', name: 'read', arguments: {} },
    },
  } as unknown as AgentSessionEvent);
  assert.equal(events.length, 0);
  emit!({
    type: 'tool_execution_start',
    toolCallId: 'call',
    toolName: 'read',
    args: {},
  });
  emit!({
    type: 'tool_execution_end',
    toolCallId: 'call',
    toolName: 'read',
    result: {},
    isError: false,
  });
  assert.deepEqual(
    events.map((event) => event.type),
    ['tool_start', 'tool_end'],
  );
  session.dispose();
});

test('all Pi user input methods enforce the model-window preflight before inference', async () => {
  let calls = 0;
  const sdk = {
    sessionId: 'session',
    systemPrompt: 'x'.repeat(6000),
    model: { contextWindow: 1000 },
    getActiveToolNames: () => [],
    getAllTools: () => [],
    subscribe: () => () => {},
    dispose: () => {},
    prompt: async () => {
      calls++;
    },
    steer: async () => {
      calls++;
    },
    followUp: async () => {
      calls++;
    },
  } as unknown as AgentSession;
  const session = new PiRuntimeSession(sdk);
  for (const method of ['prompt', 'steer', 'followUp'] as const)
    await assert.rejects(
      session[method]({ text: 'task' }),
      /context_budget_exceeded/,
    );
  assert.equal(calls, 0);
  session.dispose();
});
