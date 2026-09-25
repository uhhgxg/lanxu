import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserCog, LogOut, Plus, BarChart3 } from 'lucide-react';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import { useGroupsStore } from '../stores/groups';
import { ChatView } from '../components/chat/ChatView';
import { ChatGroupItem } from '../components/chat/ChatGroupItem';
import { DeleteWorkspaceDialog } from '../components/chat/DeleteWorkspaceDialog';
import { AgentWorkspaceGroup } from '../components/layout/AgentWorkspaceGroup';
import { ConfirmDialog } from '../components/common';
import { CreateContainerDialog } from '../components/chat/CreateContainerDialog';
import { RenameDialog } from '../components/chat/RenameDialog';
import { EmojiAvatar } from '../components/common/EmojiAvatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useSwipeBack } from '../hooks/useSwipeBack';
import { useClearWorkspace } from '../hooks/useClearWorkspace';
import { type GroupEntry, compareByLastActivity } from '../utils/group-utils';
import {
  getAgentNavigationTargets,
  getPrimaryAgentWorkspaceRows,
  groupWorkspacesByAgent,
  isAgentSectionCollapsible,
  partitionAgentWorkspaceSections,
} from '../utils/agent-product';
import { useDeleteWorkspace } from '../hooks/useDeleteWorkspace';

export function ChatPage() {
  const { groupFolder } = useParams<{ groupFolder?: string }>();
  const navigate = useNavigate();
  // 窄 selector：整 store 订阅会让整个页面跟着流式输出每帧重渲染。
  const groups = useChatStore((s) => s.groups);
  const currentGroup = useChatStore((s) => s.currentGroup);
  const selectGroup = useChatStore((s) => s.selectGroup);
  const loadGroups = useChatStore((s) => s.loadGroups);
  const togglePin = useChatStore((s) => s.togglePin);
  const {
    clearState,
    clearLoading,
    openClear,
    closeClear,
    handleClearConfirm,
  } = useClearWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameState, setRenameState] = useState({
    open: false,
    jid: '',
    name: '',
  });
  const {
    deleteState,
    deleteLoading,
    openDelete,
    closeDelete,
    handleDeleteConfirm,
  } = useDeleteWorkspace({
    onDeleted: () => navigate('/chat', { replace: true }),
  });
  const user = useAuthStore((s) => s.user);
  const appearance = useAuthStore((s) => s.appearance);
  const userInitial = (user?.display_name ||
    user?.username ||
    '?')[0].toUpperCase();

  const routeGroupJid = useMemo(() => {
    if (!groupFolder) return null;
    const entry =
      Object.entries(groups).find(
        ([jid, info]) =>
          info.folder === groupFolder &&
          jid.startsWith('web:') &&
          !!info.is_home,
      ) ||
      Object.entries(groups).find(
        ([jid, info]) => info.folder === groupFolder && jid.startsWith('web:'),
      ) ||
      Object.entries(groups).find(([_, info]) => info.folder === groupFolder);
    return entry?.[0] || null;
  }, [groupFolder, groups]);
  const runnerStates = useGroupsStore((s) => s.runnerStates);
  const hasGroups = Object.keys(groups).length > 0;

  // 移动端唯一的工作区列表入口：桌面侧边栏改为条件挂载后，/chat 落地页
  // 不再有其他组件触发 loadGroups（store 内部有 in-flight 去重，桌面端
  // 与侧边栏的并发调用只会发一个请求）。
  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  // Mobile and desktop share the same Agent-first navigation contract.
  const agentSections = useMemo(() => {
    const entries: GroupEntry[] = Object.entries(groups).map(([jid, info]) => ({
      jid,
      ...info,
    }));
    entries.sort(compareByLastActivity);
    const home = entries.find((entry) => entry.is_my_home);
    const defaultAgentId = home?.agent_profile_id || '__default__';
    const prioritized = [...entries].sort((a, b) => {
      if (a.is_my_home) return -1;
      if (b.is_my_home) return 1;
      return Number(!!b.pinned_at) - Number(!!a.pinned_at);
    });
    return groupWorkspacesByAgent(prioritized, defaultAgentId);
  }, [groups]);
  const agentPartitions = useMemo(
    () => partitionAgentWorkspaceSections(agentSections),
    [agentSections],
  );
  const hasAnyGroup = agentSections.length > 0;

  // Sync URL param to store selection. No auto-redirect to home container —
  // users land on the welcome screen and choose a container manually.
  useEffect(() => {
    if (!groupFolder) return;
    if (routeGroupJid && currentGroup !== routeGroupJid) {
      selectGroup(routeGroupJid);
      return;
    }
    if (hasGroups && !routeGroupJid) {
      // Group not found — may be newly created (task workspace). Retry once after refresh.
      loadGroups().then(() => {
        const freshGroups = useChatStore.getState().groups;
        const found = Object.entries(freshGroups).find(
          ([jid, info]) =>
            info.folder === groupFolder && jid.startsWith('web:'),
        );
        if (found) {
          selectGroup(found[0]);
        } else {
          navigate('/chat', { replace: true });
        }
      });
    }
  }, [
    groupFolder,
    routeGroupJid,
    hasGroups,
    currentGroup,
    selectGroup,
    navigate,
    loadGroups,
  ]);

  const activeGroupJid = groupFolder ? routeGroupJid : currentGroup;
  const chatViewRef = useRef<HTMLDivElement>(null);

  const handleBackToList = () => {
    navigate('/chat');
  };

  useSwipeBack(chatViewRef, handleBackToList);

  const renderMobileAgentSection = (
    section: (typeof agentSections)[number],
  ) => {
    const { directGroup, workspaces } = getAgentNavigationTargets(section);
    return (
      <AgentWorkspaceGroup
        key={section.id}
        agentId={section.id}
        name={section.name}
        collapsible={isAgentSectionCollapsible(section)}
        workspaceCount={workspaces.length}
        workspaceNames={workspaces.map((workspace) => workspace.name)}
        runningCount={
          section.items.filter((item) => runnerStates[item.jid] === 'running')
            .length
        }
        isDirectActive={
          !!directGroup?.is_my_home && directGroup.jid === currentGroup
        }
        containsActiveWorkspace={section.items.some(
          (item) => item.jid === currentGroup,
        )}
        onSelect={() => {
          if (!directGroup) return;
          selectGroup(directGroup.jid);
          navigate(`/chat/${directGroup.folder}?sessions=1`);
        }}
        onRebuild={
          directGroup?.is_my_home && directGroup.can_modify
            ? () => openClear(directGroup.jid, section.name)
            : undefined
        }
      >
        {workspaces.map((workspace) => (
          <ChatGroupItem
            key={workspace.jid}
            jid={workspace.jid}
            name={workspace.name}
            folder={workspace.folder}
            lastMessage={workspace.lastMessage}
            isActive={currentGroup === workspace.jid}
            isHome={false}
            isPinned={!!workspace.pinned_at}
            isRunning={runnerStates[workspace.jid] === 'running'}
            canModify={workspace.can_modify}
            onSelect={(jid, folder) => {
              selectGroup(jid);
              navigate(`/chat/${folder}?sessions=1`);
            }}
            onRename={(jid, name) => setRenameState({ open: true, jid, name })}
            onClearHistory={openClear}
            onDelete={openDelete}
            onTogglePin={(jid) => void togglePin(jid)}
          />
        ))}
      </AgentWorkspaceGroup>
    );
  };

  const renderMobilePrimaryAgentWorkspaces = (
    section: (typeof agentSections)[number],
  ) => {
    const workspaces = getPrimaryAgentWorkspaceRows(section);
    const selectWorkspace = (jid: string, folder: string) => {
      selectGroup(jid);
      navigate(`/chat/${folder}?sessions=1`);
    };

    return (
      <div data-hc-primary-agent-workspaces={section.id}>
        {workspaces.map((workspace) => (
          <ChatGroupItem
            key={workspace.jid}
            jid={workspace.jid}
            name={workspace.name}
            folder={workspace.folder}
            lastMessage={workspace.lastMessage}
            isActive={currentGroup === workspace.jid}
            isHome={!!workspace.is_my_home}
            isPinned={!!workspace.pinned_at}
            isRunning={runnerStates[workspace.jid] === 'running'}
            canModify={workspace.can_modify}
            onSelect={selectWorkspace}
            onRename={(jid, name) => setRenameState({ open: true, jid, name })}
            onClearHistory={openClear}
            onDelete={openDelete}
            onTogglePin={(jid) => void togglePin(jid)}
          />
        ))}
      </div>
    );
  };

  return (
    <div data-chat-shell="true" className="h-full flex bg-muted/30">
      {/* Mobile workspace list when no group selected */}
      {!groupFolder && (
        <div className="block lg:hidden w-full overflow-y-auto">
          {/* Mobile header: horizontal logo + actions */}
          <div
            data-mobile-workspace-header="true"
            className="flex items-start gap-3 px-5 pb-4 pt-6"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                私有智能工作台
              </p>
              <img
                src={`${import.meta.env.BASE_URL}icons/logo-text.svg`}
                alt={appearance?.appName || '澜序'}
                className="mt-1 h-7"
              />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                工作区已就绪
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              title="新建工作区"
              aria-label="新建工作区"
            >
              <Plus className="h-5 w-5" />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="rounded-full hover:ring-2 hover:ring-brand-200 transition-all cursor-pointer"
                  aria-label="用户菜单"
                >
                  <EmojiAvatar
                    imageUrl={user?.avatar_url}
                    emoji={user?.avatar_emoji}
                    color={user?.avatar_color}
                    fallbackChar={userInitial}
                    size="md"
                    className="w-8 h-8"
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-44 p-1">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground truncate border-b border-border mb-1">
                  {user?.display_name || user?.username}
                </div>
                <button
                  onClick={() => navigate('/settings?tab=profile')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground cursor-pointer"
                >
                  <UserCog className="w-4 h-4" /> 个人设置
                </button>
                <button
                  onClick={() => navigate('/usage')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4" /> 用量统计
                </button>
                <button
                  onClick={async () => {
                    await useAuthStore.getState().logout();
                    navigate('/login');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-destructive/10 text-destructive cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> 退出登录
                </button>
              </PopoverContent>
            </Popover>
          </div>
          {hasAnyGroup ? (
            <div className="px-2 pb-nav-safe">
              {agentPartitions.primary && (
                <section aria-labelledby="mobile-primary-agent-heading">
                  <h2
                    id="mobile-primary-agent-heading"
                    className="px-3 pb-1 pt-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground"
                  >
                    主智能体 · {agentPartitions.primary.name}
                  </h2>
                  {renderMobilePrimaryAgentWorkspaces(agentPartitions.primary)}
                </section>
              )}
              {agentPartitions.custom.length > 0 && (
                <section
                  aria-labelledby="mobile-custom-agent-heading"
                  className="mt-4 border-t border-border/60 pt-3"
                >
                  <h2
                    id="mobile-custom-agent-heading"
                    className="px-3 pb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground"
                  >
                    自定义智能体
                  </h2>
                  {agentPartitions.custom.map(renderMobileAgentSection)}
                </section>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 px-4">
              <img
                src={`${import.meta.env.BASE_URL}icons/logo-text.svg`}
                alt={appearance?.appName || '澜序'}
                className="h-12 mb-6"
              />
              <p className="text-muted-foreground text-sm">暂无智能体工作区</p>
            </div>
          )}
        </div>
      )}

      {/* Chat View - Desktop: visible when active group exists, Mobile: only in detail route */}
      {activeGroupJid ? (
        <div
          ref={chatViewRef}
          className={`${groupFolder ? 'flex-1 min-w-0 h-full overflow-hidden lg:pt-4' : 'hidden lg:block flex-1 min-w-0 h-full overflow-hidden lg:pt-4'}`}
        >
          <ChatView groupJid={activeGroupJid} onBack={handleBackToList} />
        </div>
      ) : (
        <div
          data-empty-workspace="true"
          className="hidden lg:flex flex-1 items-center justify-center bg-background rounded-t-3xl rounded-b-none mt-5 mr-5 mb-0 ml-3 relative"
        >
          <div className="max-w-md px-8 text-center">
            <div className="mx-auto mb-7 flex w-fit items-center gap-2 rounded-full border border-border bg-muted/45 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Workspace ready
            </div>
            <h2 className="text-3xl font-semibold tracking-[-0.045em] text-foreground">
              今天，从一个工作区开始
            </h2>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              从左侧选择一个工作区，让智能体接手研究、编写与执行。
              所有上下文都留在你的工作空间里。
            </p>
            <div className="mx-auto mt-10 grid max-w-sm grid-cols-3 divide-x divide-border border-y border-border py-4 text-left">
              <div className="px-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                  Context
                </p>
                <p className="mt-1 text-xs text-muted-foreground">连续记忆</p>
              </div>
              <div className="px-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                  Tools
                </p>
                <p className="mt-1 text-xs text-muted-foreground">可控执行</p>
              </div>
              <div className="px-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                  Private
                </p>
                <p className="mt-1 text-xs text-muted-foreground">自托管</p>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={clearState.open}
        onClose={closeClear}
        onConfirm={handleClearConfirm}
        title="重建工作区"
        message={`确认重建工作区「${clearState.name}」吗？这会永久删除全部聊天记录、上下文、所有子对话及其消息、工作目录文件，以及该工作区的全部 Memory（含版本历史、遗忘记录和 澜序 称呼偏好）；Home 还会重置首次唤醒状态。关联定时任务会停止并移入回收站，运行历史保留；持久化目录 (data/extra/) 保留。此操作不可撤销。`}
        confirmText="确认重建"
        cancelText="取消"
        confirmVariant="danger"
        loading={clearLoading}
      />
      <RenameDialog
        open={renameState.open}
        jid={renameState.jid}
        currentName={renameState.name}
        onClose={() => setRenameState({ open: false, jid: '', name: '' })}
      />
      <DeleteWorkspaceDialog
        state={deleteState}
        onClose={closeDelete}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />
      <CreateContainerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(jid, folder) => {
          selectGroup(jid);
          navigate(`/chat/${folder}?sessions=1`);
        }}
      />
    </div>
  );
}
