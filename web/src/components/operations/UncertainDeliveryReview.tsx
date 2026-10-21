import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

import { api } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PromptDialog } from '@/components/common/PromptDialog';

interface UncertainDeliveryItem {
  id: string;
  turnRunId: string;
  kind: string;
  ordinal: number;
  revision: number;
  provider: string;
  accountId: string;
  chatId: string;
  attempt: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UncertainDeliveryReviewProps {
  onResolved?: () => void;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export function UncertainDeliveryReview({
  onResolved,
}: UncertainDeliveryReviewProps) {
  const [items, setItems] = useState<UncertainDeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [deliveryPromptItem, setDeliveryPromptItem] =
    useState<UncertainDeliveryItem | null>(null);
  const [failureConfirmItem, setFailureConfirmItem] =
    useState<UncertainDeliveryItem | null>(null);

  const loadItems = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const result = await api.get<{
        items: UncertainDeliveryItem[];
        total: number;
      }>('/api/status/channel-outbox/uncertain?limit=100');
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '待确认投递加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadItems(true);
  }, [loadItems]);

  const resolveItem = useCallback(
    async (
      item: UncertainDeliveryItem,
      resolution: 'delivered' | 'failed',
      providerMessageId?: string,
    ) => {
      setResolvingId(item.id);
      setError(null);
      try {
        await api.post(
          `/api/status/channel-outbox/${encodeURIComponent(item.id)}/resolve`,
          {
            resolution,
            expectedRevision: item.revision,
            ...(resolution === 'delivered' ? { providerMessageId } : {}),
          },
        );
        await loadItems();
        onResolved?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '投递裁决失败');
        // A stale revision means another operator already acted. Re-read so
        // the page does not keep showing a row that is no longer actionable.
        await loadItems();
      } finally {
        setResolvingId(null);
      }
    },
    [loadItems, onResolved],
  );

  return (
    <>
      <section
        className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10"
        aria-labelledby="uncertain-delivery-title"
      >
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="uncertain-delivery-title"
                className="text-base font-semibold text-foreground"
              >
                待确认消息投递
              </h2>
              {items.length > 0 && (
                <Badge variant="warning">{items.length} 条</Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              ACK
              丢失时，系统无法判断消息是否已经送达。先在渠道侧核对，再标记“已送达”或“发送失败”。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadItems()}
            disabled={loading || refreshing}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            刷新
          </Button>
        </div>

        {error && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg bg-error-bg px-3 py-2 text-xs text-error sm:mx-5">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center px-5 py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            正在读取待确认投递…
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            当前没有需要人工裁决的投递。
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              const resolving = resolvingId === item.id;
              return (
                <div key={item.id} className="space-y-3 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="warning">ACK 未确认</Badge>
                        <span className="text-sm font-medium text-foreground">
                          {item.provider} · {item.kind}
                        </span>
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        目标：{item.chatId} · 账号：{item.accountId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Turn {item.turnRunId} · 第 {item.attempt} 次尝试 ·
                        更新于 {formatTime(item.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => setDeliveryPromptItem(item)}
                        disabled={resolving}
                      >
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        已送达
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFailureConfirmItem(item)}
                        disabled={resolving}
                      >
                        发送失败
                      </Button>
                    </div>
                  </div>
                  {item.error && (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      最近错误：{item.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PromptDialog
        open={deliveryPromptItem !== null}
        title="确认消息已送达"
        label="渠道返回的消息 ID"
        placeholder="例如：msg_123456"
        confirmText="确认已送达"
        onClose={() => setDeliveryPromptItem(null)}
        onConfirm={(providerMessageId) => {
          if (deliveryPromptItem) {
            void resolveItem(
              deliveryPromptItem,
              'delivered',
              providerMessageId,
            );
          }
          setDeliveryPromptItem(null);
        }}
      />

      <ConfirmDialog
        open={failureConfirmItem !== null}
        title="标记发送失败"
        message="确认渠道侧没有收到这条消息吗？标记后，系统会释放这条待确认投递对应的阻塞状态。"
        confirmText="确认失败"
        confirmVariant="danger"
        loading={failureConfirmItem?.id === resolvingId}
        onClose={() => setFailureConfirmItem(null)}
        onConfirm={() => {
          if (failureConfirmItem) {
            void resolveItem(failureConfirmItem, 'failed');
          }
          setFailureConfirmItem(null);
        }}
      />
    </>
  );
}
