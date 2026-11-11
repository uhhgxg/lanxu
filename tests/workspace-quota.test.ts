import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const usage = vi.hoisted(() => ({ read: vi.fn(), window: vi.fn() }));
vi.mock('../src/db.js', () => ({
  getUsageAnalytics: usage.read,
  getUsageDateWindow: usage.window,
}));
import {
  checkWorkspaceQuota,
  evaluateWorkspaceQuota,
  WorkspaceQuotaSchema,
} from '../src/workspace-quota.js';

afterEach(() => {
  vi.unstubAllEnvs();
  usage.read.mockReset();
});
describe('workspace quota admission', () => {
  it('blocks exactly at either limit and allows below the limit', () => {
    expect(
      evaluateWorkspaceQuota(
        { dailyTokens: 10 },
        { totalTokens: 9, providerEstimatedCostUSD: 0 },
      ).allowed,
    ).toBe(true);
    expect(
      evaluateWorkspaceQuota(
        { dailyTokens: 10 },
        { totalTokens: 10, providerEstimatedCostUSD: 0 },
      ).allowed,
    ).toBe(false);
    expect(
      evaluateWorkspaceQuota(
        { dailyCostUSD: 1 },
        { totalTokens: 0, providerEstimatedCostUSD: 1 },
      ).allowed,
    ).toBe(false);
    expect(
      evaluateWorkspaceQuota(
        { dailyTokens: 0 },
        { totalTokens: 0, providerEstimatedCostUSD: 0 },
      ).allowed,
    ).toBe(false);
  });
  it('rejects invalid limit configuration and unavailable usage', () => {
    expect(WorkspaceQuotaSchema.safeParse({ dailyTokens: -1 }).success).toBe(
      false,
    );
    expect(WorkspaceQuotaSchema.safeParse({}).success).toBe(false);
    expect(
      evaluateWorkspaceQuota(
        { dailyTokens: 10 },
        { totalTokens: NaN, providerEstimatedCostUSD: 0 },
      ).allowed,
    ).toBe(false);
  });
  it('does not access the ledger when no policy was configured', () => {
    vi.stubEnv('MINICLAW_WORKSPACE_QUOTAS_FILE', '');
    expect(checkWorkspaceQuota('demo').allowed).toBe(true);
    expect(usage.read).not.toHaveBeenCalled();
  });
  it('fails closed on missing explicit policy', () => {
    vi.stubEnv(
      'MINICLAW_WORKSPACE_QUOTAS_FILE',
      path.join(os.tmpdir(), 'nonexistent-quota-policy.json'),
    );
    expect(checkWorkspaceQuota('demo').allowed).toBe(false);
  });
  it('uses the ledger billing day across UTC midnight boundaries and scopes by workspace', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-policy-'));
    const file = path.join(folder, 'quota.json');
    try {
      fs.writeFileSync(file, JSON.stringify({ demo: { dailyTokens: 100 } }));
      vi.stubEnv('MINICLAW_WORKSPACE_QUOTAS_FILE', file);
      usage.read.mockReturnValue({
        summary: { totalTokens: 100, providerEstimatedCostUSD: 0 },
      });
      usage.window.mockReturnValue({ from: '2026-10-31', to: '2026-10-31' });
      expect(
        checkWorkspaceQuota('demo', new Date('2026-10-30T16:30:00Z')).allowed,
      ).toBe(false);
      expect(usage.read).toHaveBeenCalledWith({
        from: '2026-10-31',
        to: '2026-10-31',
        groupFolder: 'demo',
      });
      expect(checkWorkspaceQuota('other').allowed).toBe(true);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
