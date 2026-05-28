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
}

export type MockDashboardData = {
  papers: MockPaper[]
  kpiMetrics: MockKpiMetric[]
  progress: MockProgress
  suggestions: MockSuggestion[]
  navigationItems: NavigationItemData[]
}
