import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AutomationSubscriptionIssue, DailyBriefingSnapshot, Paper } from '../../types'
import type { MockPaper, MockProgress, MockSuggestion } from './mockData'
import type { KpiCardProps } from './KpiCard'
import type { PriorityPaperCardProps } from './PriorityPaperCard'
import type { SuggestionItemData } from './SuggestionItem'
import { PageHeader } from './PageHeader'
import { KpiCardRow } from './KpiCardRow'
import { PrioritySection } from './PrioritySection'
import { PaperSummarySection } from './PaperSummarySection'
import { ProgressPanel } from './ProgressPanel'
import { SuggestionsPanel } from './SuggestionsPanel'
import { showToast } from './DashboardToast'
import { DashboardKpiDialog } from './DashboardKpiDialog'

type DashboardContentProps = {
  papers: MockPaper[]
  kpiMetrics: KpiCardProps[]
  briefing: DailyBriefingSnapshot | null
  rawPapers: Paper[]
  subscriptionIssues: AutomationSubscriptionIssue[]
  dashboardError?: string
  priorityPapers: Omit<PriorityPaperCardProps, 'onRead'>[]
  progress: MockProgress
  suggestions: MockSuggestion[]
  onOpenPaper?: (paperId: number) => void
  briefingDate?: string
  generatedAtTime?: string
  readingProgress?: number
  searchQuery?: string
  onViewReport?: () => void
  onOpenSettings?: () => void
  onAdjustPlan?: () => void
  onAddToProject?: (paperTitle: string) => void
  onRefreshData?: () => Promise<void>
}

export function DashboardContent({
  papers,
  kpiMetrics,
  briefing,
  rawPapers,
  subscriptionIssues,
  dashboardError,
  priorityPapers,
  progress,
  suggestions,
  onOpenPaper,
  briefingDate,
  generatedAtTime,
  readingProgress,
  searchQuery = '',
  onViewReport,
  onOpenSettings,
  onAdjustPlan,
  onAddToProject,
  onRefreshData,
}: DashboardContentProps) {
  const navigate = useNavigate()
  const [activeKpiMetric, setActiveKpiMetric] = useState<KpiCardProps | null>(null)

  // Map MockSuggestion[] to SuggestionItemData[] with number field
  const suggestionItems: SuggestionItemData[] = suggestions.map(
    (suggestion, index) => ({
      id: suggestion.id,
      number: String(index + 1).padStart(2, '0'),
      category: suggestion.category,
      title: suggestion.title,
      reason: suggestion.reason,
      actionLabel: suggestion.actionLabel,
    })
  )

  function handleReadPaper(index: number) {
    // Priority papers come from briefing top_papers — try to find matching paper
    const priorityPaper = priorityPapers[index]
    if (!priorityPaper) return

    if (priorityPaper.paperId) {
      const numId = parseInt(priorityPaper.paperId, 10)
      if (!isNaN(numId) && onOpenPaper) {
        onOpenPaper(numId)
        return
      }
    }

    // Find the paper in the papers list by title match
    const matchedPaper = papers.find(p => p.title === priorityPaper.title)
    if (matchedPaper) {
      const numId = parseInt(matchedPaper.id, 10)
      if (!isNaN(numId) && onOpenPaper) {
        onOpenPaper(numId)
        return
      }
    }
    showToast('正在打开论文...', 'info')
  }

  function handleSuggestionAction(id: string) {
    const index = parseInt(id.replace('suggestion-', ''), 10) - 1
    const suggestion = suggestions[index]
    if (!suggestion) return

    switch (suggestion.category) {
      case '待优先阅读': {
        // Find and open the corresponding paper
        const topPaper = priorityPapers[index]
        if (topPaper) {
          if (topPaper.paperId) {
            const numId = parseInt(topPaper.paperId, 10)
            if (!isNaN(numId) && onOpenPaper) {
              onOpenPaper(numId)
              return
            }
          }
          const matched = papers.find(p => p.title === topPaper.title)
          if (matched) {
            const numId = parseInt(matched.id, 10)
            if (!isNaN(numId) && onOpenPaper) {
              onOpenPaper(numId)
              return
            }
          }
        }
        showToast('正在打开论文...', 'info')
        break
      }
      case '研究趋势':
        navigate('/tracking')
        showToast('跳转到学术追踪', 'info')
        break
      case '潜在风险':
        if (onAdjustPlan) onAdjustPlan()
        else showToast('计划调整功能开发中', 'info')
        break
      default:
        showToast('操作已记录', 'success')
    }
  }

  function handleViewAll() {
    navigate('/')
    showToast('跳转到论文管理', 'info')
  }

  return (
    <div className="grid grid-cols-[1fr_320px] gap-5 p-5">
      {/* Center column */}
      <div className="flex flex-col gap-5 min-w-0">
        <PageHeader
          date={briefingDate}
          lastUpdate={generatedAtTime ? `最后更新 ${generatedAtTime}` : undefined}
          readingProgress={readingProgress !== undefined ? `阅读进度 ${readingProgress}%` : undefined}
        />
        <KpiCardRow metrics={kpiMetrics} onMetricClick={setActiveKpiMetric} />
        <PrioritySection
          papers={priorityPapers}
          onReadPaper={handleReadPaper}
          onViewAll={handleViewAll}
          onAddToProject={onAddToProject}
          onFavoriteChange={() => onRefreshData?.()}
        />
        <PaperSummarySection
          papers={papers}
          onOpenPaper={onOpenPaper}
          searchQuery={searchQuery}
          onAddToProject={onAddToProject}
          onRefreshData={onRefreshData}
        />
      </div>

      {/* Right panel */}
      <div className="flex flex-col gap-4">
        <ProgressPanel
          readCount={progress.readCount}
          pendingCount={progress.pendingCount}
          totalTarget={progress.totalTarget}
          percentage={progress.percentage}
          estimatedCompletion={progress.estimatedCompletion}
          weeklyData={progress.weeklyData}
        />
        <SuggestionsPanel
          suggestions={suggestionItems}
          totalCount={suggestions.length}
          onAction={handleSuggestionAction}
        />
      </div>

      <DashboardKpiDialog
        open={activeKpiMetric !== null}
        onOpenChange={(open) => { if (!open) setActiveKpiMetric(null) }}
        metric={activeKpiMetric}
        briefing={briefing}
        papers={rawPapers}
        subscriptionIssues={subscriptionIssues}
        error={dashboardError}
        onOpenPaper={onOpenPaper}
      />
    </div>
  )
}
