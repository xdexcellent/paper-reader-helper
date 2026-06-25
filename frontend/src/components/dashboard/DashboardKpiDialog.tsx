import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AutomationSubscriptionIssue, DailyBriefingSnapshot, Paper } from '../../types'
import type { KpiCardProps } from './KpiCard'

type DashboardKpiDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  metric: KpiCardProps | null
  briefing: DailyBriefingSnapshot | null
  papers: Paper[]
  subscriptionIssues: AutomationSubscriptionIssue[]
  error?: string
  onOpenPaper?: (paperId: number) => void
}

const dialogCopy: Record<string, { title: string; description: string }> = {
  论文候选: {
    title: '论文候选详情',
    description: '查看今日日报筛选出的论文候选及推荐理由。',
  },
  相关项目: {
    title: '相关项目详情',
    description: '查看日报中识别到的相关项目与代码资源。',
  },
  订阅源: {
    title: '订阅源详情',
    description: '查看本次日报覆盖的订阅源与抓取异常。',
  },
  风险热点: {
    title: '风险热点详情',
    description: '查看需要关注的订阅源异常、失败条目和处理错误。',
  },
}

export function DashboardKpiDialog({
  open,
  onOpenChange,
  metric,
  briefing,
  papers,
  subscriptionIssues,
  error,
  onOpenPaper,
}: DashboardKpiDialogProps) {
  const copy = metric ? dialogCopy[metric.label] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[760px] !rounded-2xl !p-0 !bg-white !text-[#0F172A] !ring-[#E2E8F0]"
        style={{ background: '#FFFFFF', color: '#0F172A' }}
      >
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="!text-[17px] !font-semibold !text-[#0F172A]">
            {copy?.title ?? '指标详情'}
          </DialogTitle>
          <DialogDescription className="!text-[13px] !text-[#64748B]">
            {copy?.description ?? '查看工作看板指标明细。'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] overflow-y-auto px-6 pb-6 pt-4">
          {metric?.label === '论文候选' && (
            <CandidatePapersDetail briefing={briefing} papers={papers} onOpenPaper={onOpenPaper} />
          )}
          {metric?.label === '相关项目' && <ProjectDetail briefing={briefing} />}
          {metric?.label === '订阅源' && (
            <SourceDetail briefing={briefing} subscriptionIssues={subscriptionIssues} />
          )}
          {metric?.label === '风险热点' && (
            <RiskDetail briefing={briefing} subscriptionIssues={subscriptionIssues} error={error} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CandidatePapersDetail({
  briefing,
  papers,
  onOpenPaper,
}: {
  briefing: DailyBriefingSnapshot | null
  papers: Paper[]
  onOpenPaper?: (paperId: number) => void
}) {
  const items = briefing?.top_papers ?? []

  if (items.length === 0) return <DashboardKpiEmpty text="暂无论文候选" />

  return (
    <div className="space-y-3">
      <DashboardKpiSummary
        items={[
          { label: '候选论文', value: briefing?.paper_count ?? items.length },
          { label: 'Top 推荐', value: items.length },
          { label: '日报日期', value: briefing?.briefing_date ?? '--' },
        ]}
      />
      <div className="space-y-2">
        {items.map((item) => {
          const matchedPaper = item.paper_id !== null ? papers.find((paper) => paper.id === item.paper_id) : undefined
          const title = item.title ?? matchedPaper?.title ?? '未知标题'
          return (
            <div key={`${item.rank}-${title}`} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5]">
                      #{item.rank}
                    </span>
                    <span className="text-[12px] text-[#64748B]">{item.source_kind || matchedPaper?.source || '--'}</span>
                  </div>
                  <h3 className="m-0 line-clamp-2 text-[14px] font-semibold leading-5 text-[#0F172A]">{title}</h3>
                  <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[#64748B]">{item.reason || item.summary_text || '暂无推荐说明'}</p>
                </div>
                <button
                  type="button"
                  disabled={item.paper_id === null || !onOpenPaper}
                  onClick={() => item.paper_id !== null && onOpenPaper?.(item.paper_id)}
                  className="shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  打开
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectDetail({ briefing }: { briefing: DailyBriefingSnapshot | null }) {
  const projects = briefing?.projects ?? []

  if (projects.length === 0) return <DashboardKpiEmpty text="暂无相关项目" />

  return (
    <div className="space-y-3">
      <DashboardKpiSummary
        items={[
          { label: '项目数量', value: projects.length },
          { label: '日报日期', value: briefing?.briefing_date ?? '--' },
          { label: '来源覆盖', value: briefing?.source_count ?? 0 },
        ]}
      />
      <div className="space-y-2">
        {projects.map((project) => (
          <a
            key={`${project.rank}-${project.url}`}
            href={project.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 hover:border-[#BFDBFE] hover:bg-white"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-[#0F766E]">
                #{project.rank}
              </span>
              <span className="text-[12px] text-[#64748B]">{project.source_kind}</span>
            </div>
            <h3 className="m-0 text-[14px] font-semibold leading-5 text-[#0F172A]">{project.title}</h3>
            <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[#64748B]">{project.summary}</p>
          </a>
        ))}
      </div>
    </div>
  )
}

function SourceDetail({
  briefing,
  subscriptionIssues,
}: {
  briefing: DailyBriefingSnapshot | null
  subscriptionIssues: AutomationSubscriptionIssue[]
}) {
  const failedItems = briefing?.failed_items ?? []

  return (
    <div className="space-y-3">
      <DashboardKpiSummary
        items={[
          { label: '订阅源数量', value: briefing?.source_count ?? 0 },
          { label: '候选论文', value: briefing?.paper_count ?? 0 },
          { label: '异常来源', value: subscriptionIssues.length + failedItems.length },
        ]}
      />
      {subscriptionIssues.length === 0 && failedItems.length === 0 ? (
        <DashboardKpiEmpty text="订阅源暂无异常" />
      ) : (
        <IssueList subscriptionIssues={subscriptionIssues} failedItems={failedItems} />
      )}
    </div>
  )
}

function RiskDetail({
  briefing,
  subscriptionIssues,
  error,
}: {
  briefing: DailyBriefingSnapshot | null
  subscriptionIssues: AutomationSubscriptionIssue[]
  error?: string
}) {
  const failedItems = briefing?.failed_items ?? []
  const riskTotal = subscriptionIssues.length + failedItems.length + (error ? 1 : 0)

  if (riskTotal === 0) return <DashboardKpiEmpty text="暂无风险热点" />

  return (
    <div className="space-y-3">
      <DashboardKpiSummary
        items={[
          { label: '风险总数', value: riskTotal },
          { label: '订阅源异常', value: subscriptionIssues.length },
          { label: '失败条目', value: failedItems.length },
        ]}
      />
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-5 text-amber-800">
          {error}
        </div>
      )}
      <IssueList subscriptionIssues={subscriptionIssues} failedItems={failedItems} />
    </div>
  )
}

function IssueList({
  subscriptionIssues,
  failedItems,
}: {
  subscriptionIssues: AutomationSubscriptionIssue[]
  failedItems: NonNullable<DailyBriefingSnapshot['failed_items']>
}) {
  return (
    <div className="space-y-2">
      {subscriptionIssues.map((issue, index) => (
        <div key={`${issue.subscription_name}-${index}`} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <div className="mb-1 text-[13px] font-semibold text-[#0F172A]">{issue.subscription_name}</div>
          <p className="m-0 text-[12px] leading-5 text-[#64748B]">{issue.message}</p>
          <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            {issue.source_kind} / {issue.severity}
          </span>
        </div>
      ))}
      {failedItems.map((item, index) => (
        <div key={`${item.title}-${index}`} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <div className="mb-1 text-[13px] font-semibold text-[#0F172A]">{item.title}</div>
          <p className="m-0 text-[12px] leading-5 text-[#64748B]">{item.reason}</p>
          <span className="mt-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            {item.source_kind}
          </span>
        </div>
      ))}
    </div>
  )
}

function DashboardKpiSummary({ items }: { items: Array<{ label: string; value: string | number }> }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-[#E2E8F0] bg-white p-3">
          <div className="text-[11px] font-semibold text-[#64748B]">{item.label}</div>
          <div className="mt-1 text-[20px] font-bold text-[#0F172A]">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function DashboardKpiEmpty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[13px] font-semibold text-[#64748B]">
      {text}
    </div>
  )
}
