import { X } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import type { DailyStatsItem, SourceDistItem, StatsOverview } from '../../lib/api'
import type { Paper } from '../../types'

export type TrackingDetailView = 'sources' | 'imports' | 'completion' | 'topics' | 'activities'

export type TrackingDetailDrawerProps = {
  open: boolean
  view: TrackingDetailView | null
  onOpenChange: (open: boolean) => void
  sources: SourceDistItem[]
  dailyData: DailyStatsItem[]
  papers: Paper[]
  stats: StatsOverview | null
  rangeDays: number
  searchQuery?: string
  onOpenPaper?: (paperId: number) => void
}

const viewCopy: Record<TrackingDetailView, { title: string; description: string }> = {
  sources: {
    title: '来源分布详情',
    description: '查看当前统计范围内各论文来源的数量和占比。',
  },
  imports: {
    title: '导入趋势详情',
    description: '按日期查看导入数量、活跃天数和峰值变化。',
  },
  completion: {
    title: '阅读完成趋势详情',
    description: '按日期查看处理完成节奏和整体完成率。',
  },
  topics: {
    title: '主题分布详情',
    description: '查看 Top 主题以及其余主题的完整占比。',
  },
  activities: {
    title: '全部处理动态',
    description: '按更新时间倒序查看论文处理状态和来源。',
  },
}

export function TrackingDetailDrawer({
  open,
  view,
  onOpenChange,
  sources,
  dailyData,
  papers,
  stats,
  rangeDays,
  searchQuery,
  onOpenPaper,
}: TrackingDetailDrawerProps) {
  const activeView = view ?? 'sources'
  const copy = viewCopy[activeView]
  const searchText = searchQuery?.trim()

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="tracking-detail-drawer">
        <DrawerHeader className="tracking-detail-drawer-header">
          <div className="tracking-detail-drawer-heading">
            <DrawerTitle className="tracking-detail-drawer-title">{copy.title}</DrawerTitle>
            <DrawerDescription className="tracking-detail-drawer-description">
              {copy.description}
              {searchText ? ` 当前基于搜索「${searchText}」筛选结果。` : ''}
            </DrawerDescription>
          </div>
          <button
            type="button"
            className="tracking-detail-close"
            onClick={() => onOpenChange(false)}
            aria-label="关闭详情"
          >
            <X size={18} />
          </button>
        </DrawerHeader>

        <div className="tracking-detail-body">
          {activeView === 'sources' && <SourceDetails sources={sources} />}
          {activeView === 'imports' && <DailyDetails data={dailyData} rangeDays={rangeDays} mode="imports" />}
          {activeView === 'completion' && (
            <CompletionDetails data={dailyData} rangeDays={rangeDays} stats={stats} />
          )}
          {activeView === 'topics' && <TopicDetails sources={sources} />}
          {activeView === 'activities' && (
            <ActivityDetails papers={papers} onOpenPaper={onOpenPaper} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function SourceDetails({ sources }: { sources: SourceDistItem[] }) {
  const total = sources.reduce((sum, source) => sum + source.count, 0)
  const topSource = sources[0]

  return (
    <>
      <SummaryGrid
        items={[
          { label: '来源总量', value: sources.length },
          { label: '论文总量', value: total },
          { label: '最高来源', value: topSource ? topSource.source : '--' },
        ]}
      />
      <EmptyAwareTable isEmpty={sources.length === 0} emptyText="暂无来源数据">
        <thead>
          <tr>
            <th>来源</th>
            <th>数量</th>
            <th>占比</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.source}>
              <td>{source.source}</td>
              <td>{source.count}</td>
              <td>{formatPercent(source.count, total)}</td>
            </tr>
          ))}
        </tbody>
      </EmptyAwareTable>
    </>
  )
}

function DailyDetails({
  data,
  rangeDays,
  mode,
}: {
  data: DailyStatsItem[]
  rangeDays: number
  mode: 'imports' | 'completion'
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const activeDays = data.filter((item) => item.count > 0).length
  const peak = data.reduce((max, item) => Math.max(max, item.count), 0)
  const countLabel = mode === 'imports' ? '导入数' : '完成数'

  return (
    <>
      <SummaryGrid
        items={[
          { label: `近 ${rangeDays} 天总量`, value: total },
          { label: '活跃天数', value: activeDays },
          { label: '峰值日数量', value: peak },
        ]}
      />
      <EmptyAwareTable isEmpty={data.length === 0} emptyText="暂无趋势数据">
        <thead>
          <tr>
            <th>日期</th>
            <th>{countLabel}</th>
            <th>相对峰值</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.date}>
              <td>{formatDateLabel(item.date)}</td>
              <td>{item.count}</td>
              <td>{peak > 0 ? formatPercent(item.count, peak) : '0.0%'}</td>
            </tr>
          ))}
        </tbody>
      </EmptyAwareTable>
    </>
  )
}

function CompletionDetails({
  data,
  rangeDays,
  stats,
}: {
  data: DailyStatsItem[]
  rangeDays: number
  stats: StatsOverview | null
}) {
  return (
    <>
      <SummaryGrid
        items={[
          { label: '处理完成率', value: stats ? `${stats.completion_rate.toFixed(1)}%` : '--' },
          { label: '已就绪论文', value: stats?.ready ?? 0 },
          { label: '待处理队列', value: stats?.pending ?? 0 },
        ]}
      />
      <DailyDetails data={data} rangeDays={rangeDays} mode="completion" />
    </>
  )
}

function TopicDetails({ sources }: { sources: SourceDistItem[] }) {
  const total = sources.reduce((sum, source) => sum + source.count, 0)

  return (
    <>
      <SummaryGrid
        items={[
          { label: '主题数量', value: sources.length },
          { label: '覆盖论文', value: total },
          { label: 'Top 主题占比', value: sources[0] ? formatPercent(sources[0].count, total) : '--' },
        ]}
      />
      <EmptyAwareTable isEmpty={sources.length === 0} emptyText="暂无主题数据">
        <thead>
          <tr>
            <th>主题</th>
            <th>数量</th>
            <th>占比</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.source}>
              <td>{source.source}</td>
              <td>{source.count}</td>
              <td>{formatPercent(source.count, total)}</td>
            </tr>
          ))}
        </tbody>
      </EmptyAwareTable>
    </>
  )
}

function ActivityDetails({
  papers,
  onOpenPaper,
}: {
  papers: Paper[]
  onOpenPaper?: (paperId: number) => void
}) {
  const sortedPapers = [...papers].sort((left, right) => {
    const leftTime = left.updated_at ? new Date(left.updated_at).getTime() : 0
    const rightTime = right.updated_at ? new Date(right.updated_at).getTime() : 0
    return rightTime - leftTime
  })
  const completed = papers.filter((paper) => paper.status === 'ready').length
  const processing = papers.filter((paper) => paper.status === 'parsing' || paper.status === 'summarizing').length

  return (
    <>
      <SummaryGrid
        items={[
          { label: '动态总数', value: papers.length },
          { label: '已完成', value: completed },
          { label: '处理中', value: processing },
        ]}
      />
      <EmptyAwareTable isEmpty={sortedPapers.length === 0} emptyText="暂无处理动态">
        <thead>
          <tr>
            <th>时间</th>
            <th>论文</th>
            <th>来源</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {sortedPapers.map((paper) => (
            <tr key={paper.id}>
              <td>{formatDateTime(paper.updated_at)}</td>
              <td>
                <span className="tracking-detail-paper-title">{paper.title}</span>
              </td>
              <td>{paper.source || '--'}</td>
              <td>
                <span className={`tracking-detail-status tracking-detail-status--${statusTone(paper.status)}`}>
                  {statusLabel(paper.status)}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="tracking-detail-row-action"
                  onClick={() => onOpenPaper?.(paper.id)}
                  disabled={!onOpenPaper}
                >
                  打开
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </EmptyAwareTable>
    </>
  )
}

function SummaryGrid({ items }: { items: Array<{ label: string; value: string | number }> }) {
  return (
    <div className="tracking-detail-summary-grid">
      {items.map((item) => (
        <div key={item.label} className="tracking-detail-summary-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

function EmptyAwareTable({
  isEmpty,
  emptyText,
  children,
}: {
  isEmpty: boolean
  emptyText: string
  children: React.ReactNode
}) {
  if (isEmpty) {
    return <div className="tracking-detail-empty">{emptyText}</div>
  }

  return (
    <div className="tracking-detail-table-wrap">
      <table className="tracking-detail-table">{children}</table>
    </div>
  )
}

function formatPercent(value: number, total: number): string {
  if (total <= 0) return '0.0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

function formatDateLabel(date: string): string {
  const parts = date.split('-')
  if (parts.length >= 3) return `${parts[1]}-${parts[2]}`
  return date
}

function formatDateTime(value?: string): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: '完成',
    queued: '排队',
    parsing: '解析中',
    summarizing: '摘要中',
    failed: '失败',
  }
  return labels[status] ?? status
}

function statusTone(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'ready') return 'success'
  if (status === 'failed') return 'danger'
  return 'warning'
}
