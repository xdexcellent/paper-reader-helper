import { Component, type ReactNode } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from 'recharts'

type WeeklyBarChartProps = {
  weeklyData: number[] // exactly 7 non-negative integers
}

/**
 * Error boundary wrapper for the bar chart.
 * Displays fallback text if Recharts fails to render.
 */
class ChartErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-[160px] text-sm text-[#94A3B8]">
          图表加载失败
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Generates date labels for the past 7 days (today + 6 preceding days).
 * Returns short date format like "5/5", "5/6", etc.
 */
function getWeekLabels(): string[] {
  const labels: string[] = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    labels.push(`${date.getMonth() + 1}/${date.getDate()}`)
  }
  return labels
}

/**
 * 7-day bar chart showing daily reading counts using Recharts.
 * The last bar (today) is highlighted in blue (#2563EB), others use a lighter color.
 * Wrapped in an error boundary with fallback text "图表加载失败".
 */
export function WeeklyBarChart({ weeklyData }: WeeklyBarChartProps) {
  const labels = getWeekLabels()
  const chartData = weeklyData.map((count, index) => ({
    day: labels[index],
    count,
  }))

  const todayIndex = weeklyData.length - 1
  const highlightColor = '#2563EB'
  const defaultColor = '#93C5FD'

  return (
    <ChartErrorBoundary>
      <div className="w-full h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
          >
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 12 }}
              allowDecimals={false}
              domain={[0, 'auto']}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === todayIndex ? highlightColor : defaultColor}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartErrorBoundary>
  )
}
