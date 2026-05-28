import { useEffect, useMemo, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'

import { useAuth } from './components/AuthContext'
import { WorkDashboardPage } from './components/dashboard/WorkDashboardPage'
import { DashboardSidebar } from './components/dashboard/DashboardSidebar'
import { buildDashboardNavigationItems, buildResearchProgress } from './components/dashboard/dashboardUtils'
import { AgentWorkspace } from './components/agent/AgentWorkspace'
import { AiAssistantShell } from './components/AiAssistantShell'
import { DailyBriefingShell } from './components/DailyBriefingShell'
import { LoginPage } from './components/LoginPage'
import { PaperManagementPage } from './components/PaperManagementPage'
import { RecommendationShell } from './components/RecommendationShell'
import { ReaderPage } from './components/reader/ReaderPage'
import { AcademicTrackingPage } from './components/tracking/AcademicTrackingPage'
import { SubscriptionPage } from './components/SubscriptionPage'
import { ZoteroImportPage } from './components/zotero/ZoteroImportPage'
import { TooltipProvider } from './components/ui/tooltip'
import { fetchCategories, fetchPapers } from './lib/api'
import type { Category, Paper } from './types'

export default function App() {
  const { isAuthenticated, requiresPassword, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [papers, setPapers] = useState<Paper[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true)
  const navigationItems = useMemo(
    () => buildDashboardNavigationItems({ papers }),
    [papers],
  )
  const researchProgress = useMemo(
    () => buildResearchProgress(papers),
    [papers],
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
  }, [])

  async function refreshLibrary() {
    setIsLoadingLibrary(true)
    try {
      const [nextPapers, nextCategories] = await Promise.all([
        fetchPapers(),
        fetchCategories(),
      ])
      setPapers(nextPapers)
      setCategories(nextCategories)
    } finally {
      setIsLoadingLibrary(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    refreshLibrary().catch(() => {})
  }, [isAuthenticated])

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (requiresPassword && !isAuthenticated) {
    return <LoginPage />
  }

  return (
    <TooltipProvider>
      <Routes>
        <Route path="*" element={
          <div className="shell-layout">
            <DashboardSidebar
              navigationItems={navigationItems}
              activeItemId=""
              researchProgress={researchProgress}
              user={{ name: '研究者', badge: '专业版' }}
            />

            <div className="workspace-area">
              <Routes>
                <Route path="/dashboard" element={<WorkDashboardPage papers={papers} refreshLibrary={refreshLibrary} />} />
                <Route
                  path="/"
                  element={
                    <PaperManagementPage
                      papers={papers}
                      categories={categories}
                      isLoadingLibrary={isLoadingLibrary}
                      refreshLibrary={refreshLibrary}
                    />
                  }
                />
                <Route
                  path="/paper/:paperId/reader"
                  element={<ReaderPage refreshLibrary={refreshLibrary} />}
                />
                <Route
                  path="/paper/:paperId"
                  element={
                    <PaperManagementPage
                      papers={papers}
                      categories={categories}
                      isLoadingLibrary={isLoadingLibrary}
                      refreshLibrary={refreshLibrary}
                    />
                  }
                />
                <Route path="/briefing" element={
                  <div className="workspace-panel">
                    <DailyBriefingShell
                      papers={papers}
                      onOpenPaper={(paperId) => navigate(`/paper/${paperId}`)}
                    />
                  </div>
                } />
                <Route path="/assistant" element={
                  <>
                    <header className="workspace-header assistant-workspace-header">
                      <div className="workspace-title-block">
                        <h1>AI 研究助手</h1>
                        <p>智能对话、论文解读、研究分析</p>
                      </div>
                      <div className="workspace-header-right">
                        <div className="assistant-top-search" role="search">
                          <span aria-hidden="true">⌕</span>
                          <input placeholder="搜索论文、项目、订阅源或关键词" />
                          <kbd>⌘ K</kbd>
                        </div>
                        <span className="assistant-zone-pill">
                          <span aria-hidden="true" />
                          <small>当前工作区</small>
                          Asia/Shanghai
                        </span>
                        <button type="button" className="assistant-notice-btn" aria-label="通知">3</button>
                        <button type="button" className="assistant-report-btn">生成报告</button>
                      </div>
                    </header>
                    <div className="workspace-panel assistant-workspace-panel">
                      <AiAssistantShell papers={papers} />
                    </div>
                  </>
                } />
                <Route path="/recommendation" element={
                  <>
                    <header className="workspace-header">
                      <div className="workspace-title-block">
                        <h1>AI 智能推荐</h1>
                        <p>基于你的论文库和研究方向生成个性化推荐。</p>
                      </div>
                      <div className="workspace-header-right">
                        <span className="online-indicator">在线运行</span>
                      </div>
                    </header>
                    <div className="workspace-panel">
                      <RecommendationShell papers={papers} />
                    </div>
                  </>
                } />
                <Route path="/stats" element={
                  <AcademicTrackingPage papers={papers} refreshLibrary={refreshLibrary} />
                } />
                <Route path="/subscribe" element={
                  <>
                    <header className="workspace-header">
                      <div className="workspace-title-block">
                        <h1>订阅管理</h1>
                        <p>订阅 arXiv 查询和 RSS 结果，持续导入新论文。</p>
                      </div>
                      <div className="workspace-header-right">
                        <span className="online-indicator">在线运行</span>
                      </div>
                    </header>
                    <div className="workspace-panel">
                      <SubscriptionPage />
                    </div>
                  </>
                } />
                <Route path="/agent" element={
                  <>
                    <header className="workspace-header">
                      <div className="workspace-title-block">
                        <h1>文库 Agent</h1>
                        <p>AI 辅助整理你的论文库。选择范围，描述需求，Agent 会建议操作。</p>
                      </div>
                    </header>
                    <div className="workspace-panel">
                      <AgentWorkspace />
                    </div>
                  </>
                } />
                <Route path="/zotero/import" element={
                  <>
                    <header className="workspace-header">
                      <div className="workspace-title-block">
                        <h1>Zotero 导入</h1>
                        <p>从 Zotero 论文库安全导入到本地，支持预览和去重。</p>
                      </div>
                    </header>
                    <div className="workspace-panel">
                      <ZoteroImportPage />
                    </div>
                  </>
                } />
              </Routes>
            </div>
          </div>
        } />
      </Routes>
    </TooltipProvider>
  )
}
