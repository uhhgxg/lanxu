import {
  assessContextBudget,
  type ContextBudgetAssessment,
} from './context-budget.js';
import { estimatePromptTokens } from './prompt-plan.js';

export interface PiBudgetInput {
  systemPrompt: string;
  userPrompt: string;
  tools: Array<{ name: string; description?: string; parameters?: unknown }>;
  contextWindow: number;
}
/** Estimates are admission checks, never provider billing or exact tokenizer counts. */
export function assessPiStartupBudget(
  input: PiBudgetInput,
): ContextBudgetAssessment {
  const system = estimatePromptTokens(input.systemPrompt);
  const user = estimatePromptTokens(input.userPrompt);
  const tools = input.tools.map((tool) => ({
    tokens: estimatePromptTokens(JSON.stringify(tool)),
  }));
  return assessContextBudget({
    totalTokens: system + user + tools.reduce((n, tool) => n + tool.tokens, 0),
    maxTokens: input.contextWindow,
    memoryFiles: [{ tokens: user }],
    mcpTools: tools,
    systemTools: [],
    systemPromptSections: [{ tokens: system }],
    agents: [],
  });
}
export function enforcePiStartupBudget(
  input: PiBudgetInput,
): ContextBudgetAssessment {
  const assessment = assessPiStartupBudget(input);
  if (
    assessment.status === 'unavailable' ||
    assessment.status === 'hard_exceeded'
  )
    throw new Error(
      `context_budget_exceeded: ${assessment.error ?? assessment.warning}`,
    );
  return assessment;
}
