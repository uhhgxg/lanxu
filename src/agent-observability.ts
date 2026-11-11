import { createHash } from 'node:crypto';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  startObservation,
  type LangfuseAgent,
  type LangfuseTool,
  type LangfuseGuardrail,
  type LangfuseGeneration,
} from '@langfuse/tracing';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { StreamEvent } from './stream-event.types.js';
import { sanitizeLogObject, logger } from './logger.js';

type MutableObservation = LangfuseAgent | LangfuseTool | LangfuseGuardrail;
type RunTrace = {
  root: LangfuseAgent;
  generation: LangfuseGeneration;
  children: Map<string, MutableObservation>;
  finished: Set<string>;
  seenUsage: Set<string>;
  totals: Record<string, number>;
  updated: number;
};
const traces = new Map<string, RunTrace>();
const completed = new Set<string>();
let provider: NodeTracerProvider | undefined;
const MAX_TRACES = 256;
const MAX_CHILDREN = 512;
const hash = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 24);

function finish(key: string, reason: string): void {
  const trace = traces.get(key);
  if (!trace) return;
  // Release bookkeeping first: one exporter failure must not retain a run or
  // prevent sibling observations from being closed.
  traces.delete(key);
  completed.add(key);
  while (completed.size > MAX_TRACES * 2)
    completed.delete(completed.values().next().value!);
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      logger.warn({ err: error }, 'Observation close failed');
    }
  };
  for (const child of trace.children.values()) {
    attempt(() => {
      child.update({ metadata: { interrupted: true, reason } });
    });
    attempt(() => child.end());
  }
  attempt(() => {
    trace.root.update({ metadata: { terminalReason: reason } });
  });
  attempt(() => trace.generation.end());
  attempt(() => trace.root.end());
}

export function finishObservedRun(
  chatJid: string,
  runId: string,
  reason: string,
): void {
  try {
    finish(`${chatJid}:${runId}`, reason);
  } catch (error) {
    logger.warn({ err: error }, 'Agent trace finalization failed');
  }
}

/** Called only AFTER RunStreamFence has accepted the event. Telemetry cannot authorize work. */
export function observeAgentStream(
  chatJid: string,
  event: StreamEvent,
  agentId?: string,
): void {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY)
    return;
  try {
    if (!provider) {
      provider = new NodeTracerProvider({
        spanProcessors: [new LangfuseSpanProcessor()],
      });
      provider.register();
    }
    const runId = event.queryRunId ?? event.turnId;
    if (!runId) return;
    const key = `${chatJid}:${runId}`;
    if (completed.has(key)) return;
    let run = traces.get(key);
    if (!run) {
      for (const [id, prior] of traces)
        if (Date.now() - prior.updated > 30 * 60_000)
          finish(id, 'idle_timeout');
      while (traces.size >= MAX_TRACES)
        finish(traces.keys().next().value!, 'capacity');
      const root = startObservation(
        'digital-employee-turn',
        {
          metadata: {
            sessionId: hash(event.sessionId ?? chatJid),
            runId,
            agentId: agentId ?? 'main',
          },
        },
        { asType: 'agent' },
      );
      root.otelSpan.setAttribute(
        'langfuse.session.id',
        hash(event.sessionId ?? chatJid),
      );
      const generation = root.startObservation(
        'model-generation',
        {},
        { asType: 'generation' },
      );
      run = {
        root,
        generation,
        children: new Map(),
        finished: new Set(),
        seenUsage: new Set(),
        totals: {},
        updated: Date.now(),
      };
      traces.set(key, run);
    }
    run.updated = Date.now();
    const toolId = event.toolUseId;
    if (
      event.eventType === 'tool_use_start' &&
      toolId &&
      !run.children.has(toolId) &&
      !run.finished.has(toolId)
    ) {
      if (run.children.size >= MAX_CHILDREN)
        throw new Error('Trace child capacity exceeded');
      const parent =
        (event.parentToolUseId && run.children.get(event.parentToolUseId)) ||
        run.root;
      run.children.set(
        toolId,
        parent.startObservation(
          event.toolName ?? 'tool',
          {
            input: sanitizeLogObject(event.toolInput ?? {}),
            metadata: { toolUseId: toolId },
          },
          { asType: 'tool' },
        ),
      );
    }
    if (
      (event.eventType === 'tool_use_end' ||
        event.eventType === 'tool_result') &&
      toolId
    ) {
      const child = run.children.get(toolId);
      if (child) {
        child.update({ metadata: { resultPresent: !!event.toolResult } });
        child.end();
        run.children.delete(toolId);
        run.finished.add(toolId);
      }
      while (run.finished.size > MAX_CHILDREN)
        run.finished.delete(run.finished.values().next().value!);
    }
    if (event.eventType === 'permission_denied') {
      const child = run.root.startObservation(
        'permission-denied',
        {
          metadata: {
            toolName: event.permissionDenied?.toolName,
            reasonType: event.permissionDenied?.reasonType,
          },
        },
        { asType: 'guardrail' },
      );
      child.end();
    }
    if (event.eventType.startsWith('task_') && event.taskId) {
      const id = `task:${event.taskId}`;
      if (run.finished.has(id)) return;
      if (!run.children.has(id) && run.children.size < MAX_CHILDREN)
        run.children.set(
          id,
          run.root.startObservation(
            'subagent',
            { metadata: { taskId: event.taskId } },
            { asType: 'agent' },
          ),
        );
      if (['completed', 'failed', 'stopped'].includes(event.taskStatus ?? '')) {
        const child = run.children.get(id);
        child?.update({ metadata: { status: event.taskStatus } });
        child?.end();
        run.children.delete(id);
        run.finished.add(id);
        while (run.finished.size > MAX_CHILDREN)
          run.finished.delete(run.finished.values().next().value!);
      }
    }
    if (event.eventType === 'usage' && event.usage) {
      const usage = event.usage;
      const usageId = `${usage.eventId ?? event.messageUuid ?? 'legacy'}:${usage.batchIndex ?? 0}`;
      if (run.seenUsage.has(usageId)) return;
      run.seenUsage.add(usageId);
      for (const [name, amount] of Object.entries({
        input: usage.inputTokens,
        output: usage.outputTokens,
        cache_read: usage.cacheReadInputTokens,
        cache_creation: usage.cacheCreationInputTokens,
        reasoning: usage.reasoningTokens ?? 0,
      }))
        run.totals[name] = (run.totals[name] ?? 0) + amount;
      run.generation.update({
        usageDetails: run.totals,
        metadata: { usageBatches: run.seenUsage.size, lastUsage: usage },
      });
      // Only the real run_finished event closes the observation. Usage is not
      // a lifecycle event and may arrive in multiple per-message batches.
    }
  } catch (error) {
    logger.warn({ err: error }, 'Agent trace export failed');
  }
}

export async function shutdownAgentObservability(): Promise<void> {
  for (const key of [...traces.keys()]) finish(key, 'shutdown');
  await provider?.shutdown();
  provider = undefined;
  completed.clear();
}
