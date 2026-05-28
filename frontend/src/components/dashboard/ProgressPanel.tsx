import { CircularProgress } from './CircularProgress'
import { WeeklyBarChart } from './WeeklyBarChart'

type ProgressPanelProps = {
  readCount: number
  pendingCount: number
  totalTarget: number
  percentage: number
  estimatedCompletion: string
  weeklyData: number[]
}

/**
 * Today's reading progress panel.
 * Displays circular progress indicator, stats row, and weekly bar chart.
 * Handles zero reading data gracefully (0% progress, zero-height bars).
 */
export function ProgressPanel({
  readCount,
  pendingCount,
  totalTarget,
  percentage,
  estimatedCompletion,
  weeklyData,
}: ProgressPanelProps) {
  return (
    <div
      className="rounded-[16px] bg-white p-5"
      style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.04)' }}
    >
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-[15px] font-semibold text-[#0F172A]">今日进度</h3>
        <p className="text-[11px] text-[#94A3B8]">目标：{totalTarget} 篇</p>
      </div>

      {/* Circular Progress */}
      <div className="flex justify-center mb-3">
        <CircularProgress percentage={percentage} size={100} strokeWidth={7} />
      </div>

      {/* Stats Row */}
      <div className="flex justify-between mb-3 px-2">
        <div className="text-center">
          <p className="text-[14px] font-bold text-[#0F172A]">{readCount}篇</p>
          <p className="text-[11px] text-[#94A3B8]">已阅读</p>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold text-[#0F172A]">{pendingCount}篇</p>
          <p className="text-[11px] text-[#94A3B8]">待阅读</p>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold text-[#0F172A]">{estimatedCompletion}</p>
          <p className="text-[11px] text-[#94A3B8]">预计完成</p>
        </div>
      </div>

      {/* Weekly Bar Chart */}
      <WeeklyBarChart weeklyData={weeklyData} />
    </div>
  )
}
