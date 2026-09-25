import { useState } from 'react';
import {
  Github,
  ExternalLink,
  Heart,
  Code2,
  Bug,
} from 'lucide-react';
import { BugReportDialog } from '@/components/common/BugReportDialog';
import { Button } from '@/components/ui/button';

export function AboutSection() {
  const [showBugReport, setShowBugReport] = useState(false);

  return (
    <div className="space-y-6">
      {/* 项目信息 */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">澜序</h2>
        <p className="text-sm text-muted-foreground">
          基于 Claude Agent SDK 的自托管多智能体工作平台
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          版本 1.0.0 · MIT License
        </p>
      </div>

      {/* 项目仓库、维护者与问题反馈 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Github className="w-4 h-4 text-muted-foreground shrink-0" />
          <a
            href="https://github.com/uhhgxg/lanxu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1"
          >
            项目源码
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Code2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <a
            href="https://github.com/uhhgxg"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground hover:text-primary inline-flex items-center gap-1"
          >
            维护者：uhhgxg
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Bug className="w-4 h-4 text-muted-foreground shrink-0" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBugReport(true)}
          >
            <Bug className="w-3.5 h-3.5" />
            报告问题
          </Button>
        </div>
      </div>

      <BugReportDialog
        open={showBugReport}
        onClose={() => setShowBugReport(false)}
      />

      <hr className="border-border" />

      {/* 设计哲学 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-medium text-foreground">设计哲学</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          复用成熟的 Claude Agent
          SDK，把产品重心放在工作区、渠道连接、能力治理和多用户协作体验上。
        </p>
      </div>
    </div>
  );
}
