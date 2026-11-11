import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewKnowledgeReports,
  type WorkerReportSchema,
} from '../src/knowledge-review.js';
import type { z } from 'zod';
type Report = z.infer<typeof WorkerReportSchema>;
const report = (role: Report['role'], value = 'known'): Report => ({
  role,
  status: 'completed',
  findings: [{ key: 'auth.boundary', value, evidence: ['docs/auth'] }],
  uncertainties: [],
});
test('complete, supported role deliveries can be merged', () => {
  assert.equal(
    reviewKnowledgeReports({
      reports: [report('retriever'), report('analyst'), report('reviewer')],
      required_roles: ['retriever', 'analyst', 'reviewer'],
      available_evidence: ['docs/auth'],
    }).status,
    'pass',
  );
});
test('missing or partial workers require more evidence', () => {
  assert.equal(
    reviewKnowledgeReports({
      reports: [{ ...report('retriever'), status: 'partial' }],
      required_roles: ['retriever', 'reviewer'],
      available_evidence: ['docs/auth'],
    }).status,
    'needs_evidence',
  );
});
test('explicit fact conflicts escalate instead of majority voting', () => {
  const result = reviewKnowledgeReports({
    reports: [
      report('retriever'),
      report('analyst', 'different'),
      report('reviewer'),
    ],
    required_roles: ['retriever', 'analyst', 'reviewer'],
    available_evidence: ['docs/auth'],
  });
  assert.equal(result.status, 'human_review');
  assert.deepEqual(result.conflicts, ['auth.boundary']);
});
test('invented evidence references cannot pass', () => {
  assert.equal(
    reviewKnowledgeReports({
      reports: [report('reviewer')],
      required_roles: ['reviewer'],
      available_evidence: [],
    }).status,
    'needs_evidence',
  );
});
