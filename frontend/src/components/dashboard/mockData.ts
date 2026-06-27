export type MockPaper = {
  id: string
  title: string
  source: string
  date: string
  citations: number
  tags: string[]
  relevanceScore: number
  abstract: string
  project: string
  isRead: boolean
  thumbnailUrl: string
  favorite?: boolean
  venue?: string
  ccfRank?: string
  sciZone?: string
  impactFactor?: string
}

export type MockKpiMetric = {
  label: string
  value: number
  trend: string
  icon: string
  color: string
}

export type MockProgress = {
  readCount: number
  pendingCount: number
  totalTarget: number
  percentage: number
  estimatedCompletion: string
  weeklyData: number[]
}

export type MockSuggestion = {
  id: string
  category: string
  title: string
  reason: string
  actionLabel: string
}

export type NavigationItemData = {
  id: string
  label: string
  subtitle: string
  icon: string
  path: string
  isActive: boolean
  /** 当为 true 时，该项以更醒目的 CTA 按钮样式渲染，区别于普通导航列表项 */
  highlight?: boolean
}

export type MockDashboardData = {
  papers: MockPaper[]
  kpiMetrics: MockKpiMetric[]
  progress: MockProgress
  suggestions: MockSuggestion[]
  navigationItems: NavigationItemData[]
}
