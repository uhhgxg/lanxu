import fs from 'node:fs';
import { z } from 'zod';
import { getUsageAnalytics, getUsageDateWindow } from './db.js';

export const WorkspaceQuotaSchema = z
  .object({
    dailyTokens: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    dailyCostUSD: z.number().finite().nonnegative().optional(),
  })
  .refine(
    (v) => v.dailyTokens !== undefined || v.dailyCostUSD !== undefined,
    'At least one limit is required',
  );
const PolicySchema = z.record(
  z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  WorkspaceQuotaSchema,
);
export function evaluateWorkspaceQuota(
  limit: z.infer<typeof WorkspaceQuotaSchema>,
  usage: { totalTokens: number; providerEstimatedCostUSD: number },
) {
  if (
    !Number.isFinite(usage.totalTokens) ||
    !Number.isFinite(usage.providerEstimatedCostUSD) ||
    usage.totalTokens < 0 ||
    usage.providerEstimatedCostUSD < 0
  )
    return { allowed: false, reason: '工作区用量不可用，暂缓新任务' };
  if (limit.dailyTokens !== undefined && usage.totalTokens >= limit.dailyTokens)
    return { allowed: false, reason: '工作区当日 Token 配额已达上限' };
  if (
    limit.dailyCostUSD !== undefined &&
    usage.providerEstimatedCostUSD >= limit.dailyCostUSD
  )
    return { allowed: false, reason: '工作区当日模型成本配额已达上限' };
  return { allowed: true };
}
/** Fresh ledger-based admission; not an in-flight budget reservation or exact spend ceiling. */
export function checkWorkspaceQuota(
  folder: string,
  now = new Date(),
): { allowed: boolean; reason?: string } {
  const file = process.env.MINICLAW_WORKSPACE_QUOTAS_FILE;
  if (!file) return { allowed: true };
  try {
    if (fs.statSync(file).size > 256_000) throw new Error('Policy too large');
    const policy = PolicySchema.parse(
      JSON.parse(fs.readFileSync(file, 'utf8')),
    );
    const limit = policy[folder];
    if (!limit) return { allowed: true };
    const { from, to } = getUsageDateWindow(1, now);
    const usage = getUsageAnalytics({
      from,
      to,
      groupFolder: folder,
    }).summary;
    return evaluateWorkspaceQuota(limit, usage);
  } catch {
    return { allowed: false, reason: '工作区配额配置或账本不可用，暂缓新任务' };
  }
}
