import { z } from 'zod';

export const WorkerReportSchema = z.object({
  role: z.enum(['retriever', 'analyst', 'reviewer']),
  status: z.enum(['completed', 'failed', 'partial']),
  findings: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
        evidence: z.array(z.string().min(1)).min(1),
      }),
    )
    .max(100),
  uncertainties: z.array(z.string()).max(100),
});
export const KnowledgeReviewInput = {
  reports: z.array(WorkerReportSchema).min(1).max(12),
  required_roles: z.array(z.enum(['retriever', 'analyst', 'reviewer'])).min(1),
  available_evidence: z.array(z.string().min(1)).max(500),
};
export function reviewKnowledgeReports(
  input: z.infer<z.ZodObject<typeof KnowledgeReviewInput>>,
) {
  const evidence = new Set(input.available_evidence);
  const reasons: string[] = [];
  const values = new Map<string, Set<string>>();
  for (const role of input.required_roles)
    if (!input.reports.some((r) => r.role === role && r.status === 'completed'))
      reasons.push(`missing_or_failed:${role}`);
  for (const report of input.reports) {
    if (report.status !== 'completed') reasons.push(`partial:${report.role}`);
    if (!report.findings.length) reasons.push(`empty_findings:${report.role}`);
    for (const finding of report.findings) {
      if (finding.evidence.some((ref) => !evidence.has(ref)))
        reasons.push(`unsupported:${finding.key}`);
      let set = values.get(finding.key);
      if (!set) {
        set = new Set();
        values.set(finding.key, set);
      }
      set.add(finding.value.trim());
    }
    reasons.push(...report.uncertainties.map((v) => `uncertain:${v}`));
  }
  const conflicts = [...values]
    .filter(([, set]) => set.size > 1)
    .map(([key]) => key);
  return {
    status: conflicts.length
      ? 'human_review'
      : reasons.length
        ? 'needs_evidence'
        : 'pass',
    reasons: [...new Set(reasons)],
    conflicts,
    findings: [...values].map(([key, set]) => ({ key, values: [...set] })),
    boundary:
      'Checks declared evidence references and explicit fact conflicts; does not prove semantic truth or grant permissions.',
  };
}
