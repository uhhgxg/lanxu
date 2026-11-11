import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  spans: [] as Array<{
    name: string;
    end: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('@langfuse/otel', () => ({ LangfuseSpanProcessor: class {} }));
vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: class {
    register() {}
    async shutdown() {}
  },
}));
vi.mock('../src/logger.js', () => ({
  logger: { warn: vi.fn() },
  sanitizeLogObject: (value: unknown) => value,
}));
vi.mock('@langfuse/tracing', () => {
  const create = (name: string): unknown => {
    const span = {
      name,
      end: vi.fn(),
      update: vi.fn(),
      startObservation: create,
      otelSpan: { setAttribute: vi.fn() },
    };
    state.spans.push(span);
    return span;
  };
  return { startObservation: create };
});
import {
  observeAgentStream,
  shutdownAgentObservability,
  finishObservedRun,
} from '../src/agent-observability.js';

describe('accepted agent stream observations', () => {
  beforeEach(() => {
    state.spans.length = 0;
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'test');
  });
  afterEach(async () => {
    await shutdownAgentObservability();
    vi.unstubAllEnvs();
  });
  it('deduplicates tool start/end replays and terminal usage replays', () => {
    const event = {
      eventType: 'tool_use_start' as const,
      queryRunId: 'run',
      toolUseId: 'call',
      toolName: 'read',
    };
    observeAgentStream('ws', event);
    observeAgentStream('ws', event);
    observeAgentStream('ws', { ...event, eventType: 'tool_use_end' });
    observeAgentStream('ws', event);
    expect(state.spans.filter((s) => s.name === 'read')).toHaveLength(1);
    const usage = {
      eventType: 'usage' as const,
      queryRunId: 'run',
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0,
        durationMs: 1,
        numTurns: 1,
      },
    };
    observeAgentStream('ws', usage);
    finishObservedRun('ws', 'run', 'completed');
    observeAgentStream('ws', usage);
    expect(
      state.spans.filter((s) => s.name === 'digital-employee-turn'),
    ).toHaveLength(1);
    expect(
      state.spans.find((s) => s.name === 'digital-employee-turn')?.end,
    ).toHaveBeenCalledTimes(1);
  });
  it('accumulates usage batches and waits for the real terminal event', () => {
    const usage = {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0,
      durationMs: 1,
      numTurns: 1,
      batchIndex: 0,
      batchCount: 2,
    };
    observeAgentStream('ws', {
      eventType: 'usage',
      queryRunId: 'batch',
      usage,
    });
    const root = state.spans.find((s) => s.name === 'digital-employee-turn')!;
    expect(root.end).not.toHaveBeenCalled();
    observeAgentStream('ws', {
      eventType: 'usage',
      queryRunId: 'batch',
      usage: { ...usage, batchIndex: 1 },
    });
    expect(root.end).not.toHaveBeenCalled();
    const generation = state.spans.find((s) => s.name === 'model-generation')!;
    expect(generation.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        usageDetails: expect.objectContaining({ input: 2, output: 2 }),
      }),
    );
    finishObservedRun('ws', 'batch', 'completed');
    expect(root.end).toHaveBeenCalledOnce();
  });
  it('deduplicates terminal subagent lifecycle events', () => {
    const event = {
      eventType: 'task_progress' as const,
      queryRunId: 'subtask',
      taskId: 'worker',
      taskStatus: 'completed',
    };
    observeAgentStream('ws', event);
    observeAgentStream('ws', event);
    expect(state.spans.filter((s) => s.name === 'subagent')).toHaveLength(1);
  });
  it('an observation export failure does not break completion or retain the run', () => {
    observeAgentStream('ws', {
      eventType: 'tool_use_start',
      queryRunId: 'export-failure',
      toolUseId: 'call',
      toolName: 'read',
    });
    state.spans
      .find((s) => s.name === 'read')!
      .end.mockImplementationOnce(() => {
        throw new Error('export unavailable');
      });
    expect(() =>
      finishObservedRun('ws', 'export-failure', 'completed'),
    ).not.toThrow();
    expect(
      state.spans.find((s) => s.name === 'digital-employee-turn')!.end,
    ).toHaveBeenCalledOnce();
    observeAgentStream('ws', {
      eventType: 'init',
      queryRunId: 'export-failure',
    });
    expect(
      state.spans.filter((s) => s.name === 'digital-employee-turn'),
    ).toHaveLength(1);
  });
  it('keeps separate attempts distinct even when the turn id is reused', () => {
    observeAgentStream('ws', {
      eventType: 'init',
      queryRunId: 'attempt-a',
      turnId: 'turn',
    });
    observeAgentStream('ws', {
      eventType: 'init',
      queryRunId: 'attempt-b',
      turnId: 'turn',
    });
    expect(
      state.spans.filter((s) => s.name === 'digital-employee-turn'),
    ).toHaveLength(2);
  });
});
