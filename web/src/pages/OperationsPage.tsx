import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  CircleDashed,
  Container,
  Fingerprint,
  GitBranch,
  History,
  ListOrdered,
  RefreshCw,
  Route,
  Server,
  ShieldCheck,
  TriangleAlert,
  Waypoints,
} from 'lucide-react';

import { api } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useMonitorStore } from '@/stores/monitor';
import type { RunContextSnapshot, RunContextStatus } from '@/types';

interface WorkspaceSummary {
  jid: string;
  folder: string;
  name: string;
  status: string;
  is_home: boolean;
  execution_mode?: 'host' | 'container';
  interaction_mode: string;
  agent_profile: {
    id: string;
    name: string;
    version: number;
    identity_hash?: string;
    is_default: boolean;
  } | null;
  runtime_session_count?: number;
  channel_mount_count?: number;
  can_modify: boolean;
}

interface RunContextResponse {
  run_context: RunContextSnapshot | null;
  run_context_status: RunContextStatus;
}

type StageTone = 'ready' | 'waiting' | 'attention' | 'restricted';

const toneClasses: Record<StageTone, string> = {
  ready: 'text-success',
  waiting: 'text-muted-foreground',
  attention: 'text-warning',
  restricted: 'text-muted-foreground',
};

function shortHash(value: string | null | undefined, size = 12): string {
  if (!value) return '—';
  return value.length > size ? `${value.slice(0, size)}…` : value;
}

function strategyLabel(
  strategy: 'round-robin' | 'weighted-round-robin' | 'failover' | undefined,
) {
  if (strategy === 'weighted-round-robin') return '加权轮询';
  if (strategy === 'failover') return '故障转移';
  if (strategy === 'round-robin') return '轮询';
  return '权限受限';
}

function runStatusLabel(status: RunContextStatus) {
  switch (status) {
    case 'current':
      return '当前配置';
    case 'stale_profile':
      return '身份已更新';
    case 'stale_config':
      return '能力配置已更新';
    default:
      return '等待真实 Turn';
  }
}

function StageNode({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: StageTone;
  icon: typeof Activity;
}) {
  return (
    <div className="relative min-w-0 flex-1 px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Icon className={cn('size-4', toneClasses[tone])} aria-hidden="true" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function ScenarioRow({
  to,
  icon: Icon,
  title,
  summary,
  evidence,
  status,
  statusVariant,
}: {
  to: string;
  icon: typeof Activity;
  title: string;
  summary: string;
  evidence: string;
  status: string;
  statusVariant: 'success' | 'warning' | 'neutral';
}) {
  return (
    <Link
      to={to}
      className="group grid gap-3 border-t border-border px-4 py-4 transition-colors first:border-t-0 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-5"
    >
      <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-background">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {summary}
        </p>
        <p className="mt-1 font-mono text-[11px] text-foreground/70">
          {evidence}
        </p>
      </div>
      <ArrowRight
        className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
        aria-hidden="true"
      />
    </Link>
  );
}

export function OperationsPage() {
  const status = useMonitorStore((state) => state.status);
  const monitorError = useMonitorStore((state) => state.error);
  const loadStatus = useMonitorStore((state) => state.loadStatus);
  const canManageSystem = useAuthStore((state) =>
    state.hasPermission('manage_system_config'),
  );
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedJid, setSelectedJid] = useState('');
  const [runContext, setRunContext] = useState<RunContextSnapshot | null>(null);
  const [runContextStatus, setRunContextStatus] =
    useState<RunContextStatus>('none');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.jid === selectedJid) ?? null,
    [selectedJid, workspaces],
  );

  const loadWorkspaces = useCallback(async () => {
    const data = await api.get<{ workspaces: WorkspaceSummary[] }>(
      '/api/workspaces',
    );
    setWorkspaces(data.workspaces);
    setSelectedJid((current) => {
      if (data.workspaces.some((workspace) => workspace.jid === current)) {
        return current;
      }
      return (
        data.workspaces.find(
          (workspace) => workspace.can_modify && workspace.agent_profile,
        )?.jid ??
        data.workspaces[0]?.jid ??
        ''
      );
    });
  }, []);

  const refreshPage = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setPageError(null);
      try {
        await Promise.all([loadStatus(), loadWorkspaces()]);
      } catch (error) {
        setPageError(
          error instanceof Error ? error.message : '运行观测数据加载失败',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadStatus, loadWorkspaces],
  );

  useEffect(() => {
    void refreshPage(true);
    const timer = window.setInterval(() => void loadStatus(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, refreshPage]);

  useEffect(() => {
    let cancelled = false;
    const loadRunContext = async () => {
      if (!selectedWorkspace?.agent_profile || !selectedWorkspace.can_modify) {
        setRunContext(null);
        setRunContextStatus('none');
        return;
      }
      try {
        const result = await api.post<RunContextResponse>(
          `/api/agent-profiles/${selectedWorkspace.agent_profile.id}/effective-capabilities`,
          { workspace_jid: selectedWorkspace.jid },
        );
        if (!cancelled) {
          setRunContext(result.run_context);
          setRunContextStatus(result.run_context_status);
        }
      } catch {
        if (!cancelled) {
          setRunContext(null);
          setRunContextStatus('none');
        }
      }
    };
    void loadRunContext();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspace]);

  const providerPool = status?.agentOperations?.providerPool;
  const deliveryReview = status?.agentOperations?.deliveryReview;
  const activeRuntimeCount =
    status?.activeTotal ??
    (status?.activeContainers ?? 0) + (status?.activeHostProcesses ?? 0);
  const activeWorkspaceCount =
    status?.groups.filter((group) => group.active).length ?? 0;
  const contextTone: StageTone =
    runContextStatus === 'current'
      ? 'ready'
      : runContextStatus === 'none'
        ? 'waiting'
        : 'attention';
  const displayError = pageError ?? monitorError;

  if (loading && !status) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" aria-hidden="true" />
        正在汇总 Agent 运行证据…
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Agent 运行观测
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              把一次真实 Agent Turn
              从工作区入口、队列、Runner、PromptPlan、Provider
              到消息投递串成一条可检查的证据链。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status?.agentOperations?.generatedAt && (
              <span className="text-xs text-muted-foreground">
                更新于{' '}
                {new Date(
                  status.agentOperations.generatedAt,
                ).toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => void refreshPage()}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn('size-4', refreshing && 'animate-spin')}
                aria-hidden="true"
              />
              {refreshing ? '刷新中' : '刷新证据'}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {displayError && (
          <div
            className="flex items-start gap-3 rounded-xl bg-error-bg px-4 py-3 text-sm text-error ring-1 ring-error/20"
            role="alert"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{displayError}。请刷新页面或检查后端服务。</span>
          </div>
        )}

        <section aria-labelledby="turn-trace-title">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="turn-trace-title"
                className="text-lg font-semibold text-foreground"
              >
                当前执行链路
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                所有数字都来自当前实例；没有真实运行数据的阶段会明确显示等待状态。
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-success motion-safe:animate-pulse" />
              每 10 秒刷新运行态
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
            <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
              <StageNode
                label="Workspace"
                value={`${workspaces.length} 个可见工作区`}
                detail={`${activeWorkspaceCount} 个正在执行，${workspaces.reduce((sum, workspace) => sum + (workspace.channel_mount_count ?? 0), 0)} 个渠道挂载`}
                tone={workspaces.length > 0 ? 'ready' : 'waiting'}
                icon={Waypoints}
              />
              <StageNode
                label="Queue"
                value={`${status?.queueLength ?? 0} 个等待项`}
                detail="按工作区串行化消息与任务，避免同一上下文并发踩踏"
                tone={(status?.queueLength ?? 0) > 0 ? 'attention' : 'ready'}
                icon={ListOrdered}
              />
              <StageNode
                label="Runner"
                value={`${activeRuntimeCount} 个活跃执行单元`}
                detail={`${status?.activeHostProcesses ?? 0} Host · ${status?.activeContainers ?? 0} Container`}
                tone={activeRuntimeCount > 0 ? 'ready' : 'waiting'}
                icon={Container}
              />
              <StageNode
                label="PromptPlan"
                value={runStatusLabel(runContextStatus)}
                detail={
                  runContext
                    ? `plan ${shortHash(runContext.prompt.planHash)} · ${runContext.prompt.blocks.length} blocks`
                    : '选择工作区并完成一次对话后生成真实上下文快照'
                }
                tone={contextTone}
                icon={Fingerprint}
              />
              <StageNode
                label="ProviderPool"
                value={
                  providerPool
                    ? `${providerPool.healthyCount}/${providerPool.enabledCount} 健康`
                    : '受权限保护'
                }
                detail={
                  providerPool
                    ? `${strategyLabel(providerPool.strategy)} · 连续失败阈值 ${providerPool.unhealthyThreshold}`
                    : '管理员可查看调度策略和健康状态'
                }
                tone={
                  !providerPool
                    ? 'restricted'
                    : providerPool.healthyCount === providerPool.enabledCount
                      ? 'ready'
                      : 'attention'
                }
                icon={GitBranch}
              />
              <StageNode
                label="Delivery"
                value={
                  deliveryReview
                    ? deliveryReview.count === 0
                      ? '无待确认投递'
                      : `${deliveryReview.count}${deliveryReview.capped ? '+' : ''} 条待确认`
                    : '受权限保护'
                }
                detail="ACK 丢失时进入人工裁决，避免同一 Turn 重复投递"
                tone={
                  !deliveryReview
                    ? 'restricted'
                    : deliveryReview.count > 0
                      ? 'attention'
                      : 'ready'
                }
                icon={ShieldCheck}
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <section
            className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10"
            aria-labelledby="workspace-evidence-title"
          >
            <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2
                  id="workspace-evidence-title"
                  className="text-base font-semibold text-foreground"
                >
                  Workspace 与 Runtime 身份
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Profile 版本、identity hash 与运行 Session
                  用于判断旧配置是否仍在执行。
                </p>
              </div>
              <select
                value={selectedJid}
                onChange={(event) => setSelectedJid(event.target.value)}
                className="min-h-9 max-w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-64"
                aria-label="选择要检查的工作区"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.jid} value={workspace.jid}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>

            {workspaces.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <CircleDashed className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  还没有可展示的工作区
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  先在工作台创建工作区并绑定智能体。
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {workspaces.map((workspace) => {
                  const active = status?.groups.some(
                    (group) =>
                      group.active &&
                      (group.jid === workspace.jid ||
                        group.jid.startsWith(`${workspace.jid}#agent:`)),
                  );
                  return (
                    <button
                      key={workspace.jid}
                      type="button"
                      onClick={() => setSelectedJid(workspace.jid)}
                      className={cn(
                        'grid w-full gap-3 px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5',
                        selectedJid === workspace.jid
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/45',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {workspace.name}
                          </span>
                          <Badge variant={active ? 'success' : 'neutral'}>
                            {active ? '运行中' : '空闲'}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {workspace.agent_profile?.name ?? '未绑定智能体'} ·
                          profile v{workspace.agent_profile?.version ?? '—'} ·
                          identity{' '}
                          <span className="font-mono">
                            {shortHash(workspace.agent_profile?.identity_hash)}
                          </span>
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="block font-medium text-foreground">
                          {workspace.execution_mode === 'host'
                            ? 'Host'
                            : 'Container'}
                        </span>
                        执行模式
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="block font-medium tabular-nums text-foreground">
                          {workspace.runtime_session_count ?? 0}
                        </span>
                        Runtime Session
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section
            className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10"
            aria-labelledby="demo-scenarios-title"
          >
            <div className="border-b border-border px-4 py-4 sm:px-5">
              <h2
                id="demo-scenarios-title"
                className="text-base font-semibold text-foreground"
              >
                四个可演示场景
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                每个入口都对应简历中的一条主 Claim，并落到真实页面或运行快照。
              </p>
            </div>
            <ScenarioRow
              to="/memory"
              icon={Brain}
              title="Memory 并发与审计"
              summary="用两个标签页制造 revision 冲突，再查看版本链、provenance 与软删除状态。"
              evidence="expectedRevision · versions · ACL / Runner HMAC"
              status="可演示"
              statusVariant="success"
            />
            <ScenarioRow
              to="/agent-profiles"
              icon={Bot}
              title="PromptPlan 与上下文治理"
              summary="修改四段式 Prompt 后，对比身份版本和最近一次真实 Turn 的计划指纹。"
              evidence={`identity ${shortHash(selectedWorkspace?.agent_profile?.identity_hash)} · plan ${shortHash(runContext?.prompt.planHash)}`}
              status={runStatusLabel(runContextStatus)}
              statusVariant={
                runContextStatus === 'current' ? 'success' : 'warning'
              }
            />
            <ScenarioRow
              to={canManageSystem ? '/settings?tab=monitor' : '/operations'}
              icon={Route}
              title="Host 与 Docker Runner"
              summary="观察队列如何选择执行环境、启动 Runner，并通过进程状态定位运行问题。"
              evidence={`${status?.activeHostProcesses ?? 0} host · ${status?.activeContainers ?? 0} container · stdin / stdout / IPC`}
              status={activeRuntimeCount > 0 ? '正在运行' : '等待任务'}
              statusVariant={activeRuntimeCount > 0 ? 'success' : 'neutral'}
            />
            <ScenarioRow
              to={canManageSystem ? '/settings?tab=claude' : '/operations'}
              icon={GitBranch}
              title="ProviderPool 故障恢复"
              summary="查看调度策略、连续失败、自动恢复窗口以及活跃 Session 的粘性绑定。"
              evidence={
                providerPool
                  ? `${strategyLabel(providerPool.strategy)} · ${providerPool.healthyCount}/${providerPool.enabledCount} healthy`
                  : '管理员权限下展示 ProviderPool 运行证据'
              }
              status={providerPool ? '可观测' : '权限受限'}
              statusVariant={providerPool ? 'success' : 'neutral'}
            />
          </section>
        </div>

        <section
          className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10"
          aria-labelledby="run-context-title"
        >
          <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2
                id="run-context-title"
                className="text-base font-semibold text-foreground"
              >
                最近一次真实上下文快照
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                这里只展示哈希、计数和预算，不返回 Prompt
                正文、密钥或本地文件路径。
              </p>
            </div>
            <Badge
              variant={
                runContextStatus === 'current'
                  ? 'success'
                  : runContextStatus === 'none'
                    ? 'neutral'
                    : 'warning'
              }
            >
              {runStatusLabel(runContextStatus)}
            </Badge>
          </div>

          {!runContext ? (
            <div className="grid gap-5 px-5 py-10 md:grid-cols-[auto_1fr] md:items-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <History className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  还没有这个工作区的真实 Context Audit
                </p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  在工作台向该智能体发送一次消息。Runner 完成 PromptPlan 和 SDK
                  初始化后，这里会显示真实的 plan hash、上下文预算、Skills 与
                  MCP 摘要。
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link to="/chat">前往工作台</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <dl className="grid divide-y divide-border border-b border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
                {[
                  ['Turn', shortHash(runContext.turnId, 10)],
                  ['Plan hash', shortHash(runContext.prompt.planHash)],
                  [
                    'Prompt tokens',
                    runContext.prompt.estimatedTokens?.toLocaleString() ??
                      '未估算',
                  ],
                  ['Prompt blocks', String(runContext.prompt.blocks.length)],
                  [
                    'Skills',
                    `${runContext.skills.included ?? 0}/${runContext.skills.total ?? 0}`,
                  ],
                  ['MCP servers', String(runContext.mcp.serverIds.length)],
                ].map(([label, value]) => (
                  <div key={label} className="px-4 py-4 sm:px-5">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-2 truncate font-mono text-sm font-semibold tabular-nums text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="grid gap-6 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Prompt blocks
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      捕获于 {new Date(runContext.capturedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Block</th>
                          <th className="px-3 py-2.5 font-medium">Owner</th>
                          <th className="px-3 py-2.5 font-medium">Scope</th>
                          <th className="px-3 py-2.5 text-right font-medium">
                            Tokens
                          </th>
                          <th className="px-3 py-2.5 font-medium">Hash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {runContext.prompt.blocks.slice(0, 8).map((block) => (
                          <tr key={`${block.id}-${block.hash}`}>
                            <td className="px-3 py-2.5 font-medium text-foreground">
                              {block.id}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {block.owner ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {block.scope ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                              {block.estimatedTokens ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">
                              {shortHash(block.hash, 10)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-xl bg-muted/55 p-4">
                    <div className="flex items-center gap-2">
                      <Server
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      <h3 className="text-sm font-semibold text-foreground">
                        Context budget
                      </h3>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
                      {runContext.sdkContext
                        ? `${runContext.sdkContext.percentage.toFixed(1)}%`
                        : (runContext.budget?.status ?? '未获取')}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {runContext.sdkContext
                        ? `${runContext.sdkContext.totalTokens.toLocaleString()} / ${runContext.sdkContext.maxTokens.toLocaleString()} tokens`
                        : '等待 SDK 返回真实模型上下文使用量'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-muted/55 p-4">
                    <div className="flex items-center gap-2">
                      <Fingerprint
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      <h3 className="text-sm font-semibold text-foreground">
                        Runtime identity
                      </h3>
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">模式</dt>
                        <dd className="font-medium text-foreground">
                          {runContext.executionMode}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">Profile</dt>
                        <dd className="font-mono text-foreground">
                          v{runContext.agentProfile?.version ?? '—'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">Identity</dt>
                        <dd className="font-mono text-foreground">
                          {shortHash(runContext.agentProfile?.identityHash, 10)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {runContext.warnings.length > 0 ? (
                    <div className="rounded-xl bg-warning-bg p-4 text-warning ring-1 ring-warning/20">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <TriangleAlert className="size-4" aria-hidden="true" />
                        {runContext.warnings.length} 条上下文警告
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-5">
                        {runContext.warnings[0]}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-success-bg p-4 text-sm font-medium text-success ring-1 ring-success/20">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      当前快照无上下文警告
                    </div>
                  )}
                </aside>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
