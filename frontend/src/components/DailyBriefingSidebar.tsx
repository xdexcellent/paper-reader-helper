import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type {
  AutomationSubscriptionIssue,
  BriefingFailedItem,
  DailyBriefingHistoryItem,
  DailyBriefingSnapshot,
  Paper,
} from '../types'
import { BriefingProjectsSidebar } from './BriefingProjectsSidebar'
import { BriefingTopPapers } from './BriefingTopPapers'
import { DailyBriefingRiskPanel } from './DailyBriefingRiskPanel'
import { Icon } from './UiIcon'

export function DailyBriefingSidebar({
  briefing,
  error,
  failedItems,
  history,
  isReviewed,
  onOpenPaper,
  onPrint,
  onShowHistory,
  onToggleReviewed,
  papers,
  referenceCount,
  riskCount,
  subscriptionIssues,
}: {
  briefing: DailyBriefingSnapshot
  error: string
  failedItems: BriefingFailedItem[]
  history: DailyBriefingHistoryItem[]
  isReviewed: boolean
  onOpenPaper: (paperId: number) => void
  onPrint: () => void
  onShowHistory: () => void
  onToggleReviewed: () => void
  papers: Paper[]
  referenceCount: number
  riskCount: number
  subscriptionIssues: AutomationSubscriptionIssue[]
}) {
  return (
    <div className="briefing-side-stack flex flex-col gap-4">
      {/* 关键建议 */}
      <Card className="border-border/50 bg-card/80 shadow-sm dark:border-border/60 dark:bg-card/60 dark:shadow-none" id="briefing-recommendations">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon name="spark" className="size-4 text-amber-500 dark:text-amber-400" />
              关键建议
            </CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {briefing.top_papers.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <BriefingTopPapers briefing={briefing} papers={papers} onOpenPaper={onOpenPaper} />
        </CardContent>
      </Card>

      {/* 风险点 */}
      <Card
        className={cn(
          'border-border/50 bg-card/80 shadow-sm dark:border-border/60 dark:bg-card/60 dark:shadow-none',
          riskCount > 0 && 'border-destructive/30 dark:border-destructive/40',
        )}
        id="briefing-risks"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon name="warning" className={cn('size-4', riskCount > 0 ? 'text-destructive' : 'text-muted-foreground')} />
              风险点
            </CardTitle>
            <Badge
              variant={riskCount > 0 ? 'destructive' : 'secondary'}
              className="tabular-nums"
            >
              {riskCount}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {riskCount > 0 ? (
            <DailyBriefingRiskPanel error={error} subscriptionIssues={subscriptionIssues} failedItems={failedItems} />
          ) : (
            <p className="text-sm text-muted-foreground py-3 text-center">
              暂无阻断风险，继续按关键建议阅读即可。
            </p>
          )}
        </CardContent>
      </Card>

      {/* 参考资料 */}
      <Card className="border-border/50 bg-card/80 shadow-sm dark:border-border/60 dark:bg-card/60 dark:shadow-none" id="briefing-references">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon name="library" className="size-4 text-blue-500 dark:text-blue-400" />
              参考资料
            </CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {referenceCount}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {briefing.projects.length > 0 ? (
            <BriefingProjectsSidebar briefing={briefing} />
          ) : (
            <p className="text-sm text-muted-foreground py-3 text-center">
              今天没有延伸项目。
            </p>
          )}
        </CardContent>
      </Card>

      {/* 历史记录 */}
      <Card className="border-border/50 bg-card/80 shadow-sm dark:border-border/60 dark:bg-card/60 dark:shadow-none">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon name="chart" className="size-4 text-violet-500 dark:text-violet-400" />
              历史记录
            </CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {history.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {history.length > 0 ? `最近一条：${history[0].briefing_date}` : '暂无历史日报。'}
          </p>
        </CardContent>
        {history.length > 0 ? (
          <CardFooter className="pt-0">
            <Button variant="ghost" size="sm" className="w-full" onClick={onShowHistory}>
              查看历史日报
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      {/* 下一步建议 */}
      <Card className="border-border/50 bg-card/80 shadow-sm dark:border-border/60 dark:bg-card/60 dark:shadow-none dark:border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon name="assistant" className="size-4 text-emerald-500 dark:text-emerald-400" />
              下一步建议
            </CardTitle>
            <Badge variant="outline" className="tabular-nums">3</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Separator className="mb-3" />
          <Button
            size="sm"
            className={cn(
              'w-full',
              isReviewed && 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600',
            )}
            onClick={onToggleReviewed}
          >
            {isReviewed ? (
              <>
                <Icon name="check" className="size-3.5" />
                已审阅
              </>
            ) : '标记为已审阅'}
          </Button>
          <Button variant="outline" size="sm" className="w-full" onClick={() => {
            document.getElementById('briefing-summary-content')?.scrollIntoView({ behavior: 'smooth' })
          }}>
            <Icon name="fileText" className="size-3.5" />
            生成摘要
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={onPrint}>
            <Icon name="download" className="size-3.5" />
            一键导出
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
