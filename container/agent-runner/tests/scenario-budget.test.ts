import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPiStartupBudget,
  enforcePiStartupBudget,
} from '../src/pi-context-budget.js';

test('Pi preflight includes actual system, turn memory and active tool schemas', () => {
  const base = {
    systemPrompt: 'hello',
    userPrompt: 'context',
    tools: [],
    contextWindow: 32000,
  };
  assert.equal(assessPiStartupBudget(base).status, 'ok');
  assert.equal(
    assessPiStartupBudget({
      ...base,
      tools: [{ name: 'large', parameters: 'x'.repeat(60000) }],
    }).status,
    'hard_exceeded',
  );
  assert.throws(
    () => enforcePiStartupBudget({ ...base, userPrompt: 'x'.repeat(60000) }),
    /context_budget_exceeded/,
  );
});
test('unknown model windows fail closed; small models use proportional thresholds', () => {
  const base = {
    systemPrompt: 'hello',
    userPrompt: 'context',
    tools: [],
    contextWindow: 0,
  };
  assert.throws(() => enforcePiStartupBudget(base), /context_budget_exceeded/);
  assert.equal(
    assessPiStartupBudget({
      ...base,
      contextWindow: 1000,
      userPrompt: 'x'.repeat(2000),
    }).status,
    'hard_exceeded',
  );
});
