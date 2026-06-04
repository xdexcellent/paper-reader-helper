import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type {
  AutomationSettings,
  AutomationTodayStatus,
  DailyBriefingHistoryItem,
  DailyBriefingSnapshot,
} from '../types'
import { AutomationSettingsPanel } from './AutomationSettingsPanel'
import { BriefingHistoryPicker } from './BriefingHistoryPicker'
import type { BriefingFeedbackMessage } from './DailyBriefingShell.helpers'
import { isActiveRunStatus } from './DailyBriefingShell.helpers'
import { StatusBadge } from './StatusBadge'
import { Icon } from './UiIcon'

function formatDateTime(value: string): string {
  let dateStr = value
  if (/T\d{2}:\d{2}/.test(dateStr) && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr += 'Z'
  }
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('zh-CN')
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm" className="rounded-lg border-border/50 bg-muted/30 dark:bg-muted/20">
      <CardContent className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <strong className="text-lg font-bold tabular-nums text-foreground">{value}</strong>
      </CardContent>
    </Card>
  )
}

export function DailyBriefingHero({
  automationStatus,
  briefing,
  displayedBriefingDate,
  feedbackMessages,
  generatedAtTime,
  history,
  isHistoryOpen,
  isTodaySelected,
  loading,
  onRunToday,
  onSelectDate,
  onSettingsSaved,
  readingProgress,
  riskCount,
  runModeLabel,
  runningToday,
  selectedDate,
  setIsHistoryOpen,
  statusLabel,
  autoPolling,
}: {
  automationStatus: AutomationTodayStatus | null
  briefing: DailyBriefingSnapshot
  displayedBriefingDate: string
  feedbackMessages: BriefingFeedbackMessage[]
  generatedAtTime: string
  history: DailyBriefingHistoryItem[]
  isHistoryOpen: boolean
  isTodaySelected: boolean
  loading: boolean
  onRunToday: () => void
  onSelectDate: (nextDate: string) => void
  onSettingsSaved: (settings: AutomationSettings) => void | Promise<void>
  readingProgress: number
  riskCount: number
  runModeLabel: string
  runningToday: boolean
  selectedDate: string
  setIsHistoryOpen: (open: boolean) => void
  statusLabel: string
  autoPolling: boolean
}) {
  const automationProgress = automationStatus?.today_run?.progress

  return (
    <Card className="briefing-command-deck briefing-hero border-border/70 bg-card/80">
      <CardHeader className="gap-4">
        <div className="briefing-hero-bar">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="briefing-command-kicker">工作看板</Badge>
            <Badge variant="secondary">shadcn/ui</Badge>
          </div>
          <div className="briefing-hero-status" aria-label="工作看板状态">
            <StatusBadge value={statusLabel} />
            {!isTodaySelected ? <Badge variant="outline">历史日报</Badge> : null}
            <Badge variant="outline">{automationStatus?.timezone ?? 'Asia/Shanghai'}</Badge>
            {briefing.trigger_type ? <StatusBadge value={briefing.trigger_type} /> : null}
          </div>
        </div>

        <div className="briefing-hero-title-row">
          <div className="briefing-hero-title-block">
            <h2>今日工作概览</h2>
            <p className="briefing-hero-purpose">聚合今日论文、项目、风险与关键信号，用于快速判断处理优先级。</p>
          </div>
          <div className="briefing-hero-actions">
            <label className="briefing-hero-search">
              <Icon name="search" />
              <Input aria-label="搜索论文、项目或关键词" placeholder="搜索论文、项目或关键词" />
            </label>
            <Button size="sm" aria-label="生成报告" disabled={runningToday} onClick={onRunToday}>
              <Icon name="refresh" />
              {runningToday ? '生成中' : '生成报告'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="briefing-hero-status-bar">
          <span>{displayedBriefingDate}</span>
          <span>最后生成 {generatedAtTime}</span>
          <span>阅读进度 {readingProgress}%</span>
          {runModeLabel ? <span>{runModeLabel}</span> : null}
        </div>

        <div className="briefing-hero-stat-tags grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="论文候选" value={briefing.paper_count} />
          <MetricCard label="相关项目" value={briefing.project_count} />
          <MetricCard label="订阅源" value={briefing.source_count} />
          <MetricCard label="风险热点" value={riskCount} />
        </div>

        <Separator />

        <div className="briefing-hero-auto-bar">
          <span>自动生成：每天 {automationStatus?.schedule_time ?? '12:00'} · {automationStatus?.timezone ?? 'Asia/Shanghai'}</span>
          {automationStatus?.today_run?.completed_at ? <span>最近完成 {formatDateTime(automationStatus.today_run.completed_at)}</span> : null}
          <AutomationSettingsPanel onSaved={onSettingsSaved} buttonClassName="briefing-auto-settings-btn" buttonLabel="自动化设置" />
        </div>

        {feedbackMessages.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {feedbackMessages.map((message) => (
              <div
                key={message.key}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium',
                  message.tone === 'error'
                    ? 'bg-destructive/10 text-destructive dark:bg-destructive/20'
                    : 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
                )}
              >
                {message.text}
              </div>
            ))}
          </div>
        ) : null}

        {history.length > 0 && isHistoryOpen ? (
          <Card className="briefing-history-panel open">
            <CardContent className="briefing-history-panel-body">
              <BriefingHistoryPicker value={selectedDate} history={history} onChange={onSelectDate} />
            </CardContent>
          </Card>
        ) : null}

        {(runningToday || autoPolling) && automationStatus?.today_run && isActiveRunStatus(automationStatus.today_run.status) ? (
          <div className="space-y-2">
            <Progress value={automationProgress ?? 0} className="w-full">
              <span className="text-sm text-muted-foreground">
                {automationStatus.today_run.progress_message || '处理中...'}
              </span>
              <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                {automationStatus.today_run.progress}%
              </span>
            </Progress>
          </div>
        ) : null}
        {!automationStatus?.enabled || !automationStatus?.briefing_enabled ? <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">自动化已关闭</div> : null}
        {automationStatus?.fallback_used && automationStatus.fallback_briefing_date ? (
          <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            今日 {automationStatus.local_today} 暂无成功日报，当前展示 {automationStatus.fallback_briefing_date} 的回退日报
          </div>
        ) : null}
        {!automationStatus?.today_briefing_exists && !automationStatus?.fallback_used && automationStatus?.enabled && automationStatus?.briefing_enabled ? (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">今日 {automationStatus.local_today} 还没有可展示的日报</div>
        ) : null}
        {automationStatus?.today_run?.error_message ? <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive dark:bg-destructive/20">{automationStatus.today_run.error_message}</div> : null}
      </CardContent>
    </Card>
  )
}
