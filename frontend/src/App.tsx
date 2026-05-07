import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from './components/AuthContext'
import { AgentWorkspace } from './components/agent/AgentWorkspace'
import { AiAssistantShell } from './components/AiAssistantShell'
import { DailyBriefingShell } from './components/DailyBriefingShell'
import { LibraryPage } from './components/library/LibraryPage'
import { LoginPage } from './components/LoginPage'
import { RecommendationShell } from './components/RecommendationShell'
import { ReaderPage } from './components/reader/ReaderPage'
import { StatsShell } from './components/StatsShell'
import { SubscriptionPage } from './components/SubscriptionPage'
import { ZoteroImportPage } from './components/zotero/ZoteroImportPage'
import { Icon } from './components/UiIcon'
import { fetchCategories, fetchPapers } from './lib/api'
import type { Category, Paper } from './types'

function Sidebar({ theme, setTheme }: { theme: 'dark' | 'light'; setTheme: (t: 'dark' | 'light') => void }) {
  const location = useLocation()
  const { logout, requiresPassword } = useAuth()

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <aside className="global-sidebar">
      <div className="brand-block">
        <div className="brand-avatar" aria-hidden="true"><Icon name="book" /></div>
        <div className="brand-name">论文阅读器</div>
      </div>

      <Link to="/subscribe" className="new-subscribe-btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
        <Icon name="rss" />
        新订阅
      </Link>

      <nav className="side-nav" aria-label="主导航">
        <Link to="/briefing" className={`side-nav-item${isActive('/briefing') ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="side-nav-icon" aria-hidden="true"><Icon name="dashboard" /></span>
          <span className="side-nav-text">
            <strong>工作看板</strong>
            <small>每日动态和统计</small>
            {isActive('/briefing') ? <em className="side-nav-context">当前模块</em> : null}
          </span>
        </Link>

        <Link to="/assistant" className={`side-nav-item${isActive('/assistant') ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="side-nav-icon" aria-hidden="true"><Icon name="assistant" /></span>
          <span className="side-nav-text">
            <strong>AI 研究助手</strong>
            <small>智能对话与解读</small>
            {isActive('/assistant') ? <em className="side-nav-context">当前模块</em> : null}
          </span>
        </Link>

        <Link to="/stats" className={`side-nav-item${isActive('/stats') ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="side-nav-icon" aria-hidden="true"><Icon name="chart" /></span>
          <span className="side-nav-text">
            <strong>学术追踪</strong>
            <small>目标与成果管理</small>
          </span>
        </Link>

        <Link to="/" className={`side-nav-item${(location.pathname === '/' || isActive('/paper')) ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="side-nav-icon" aria-hidden="true"><Icon name="library" /></span>
          <span className="side-nav-text">
            <strong>论文管理</strong>
            <small>论文阅读与管理</small>
          </span>
        </Link>

        <Link to="/recommendation" className={`side-nav-item${isActive('/recommendation') ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="side-nav-icon" aria-hidden="true"><Icon name="spark" /></span>
          <span className="side-nav-text">
            <strong>AI 智能推荐</strong>
            <small>个性化论文推荐</small>
          </span>
        </Link>

        <Link to="/agent" className={`side-nav-item${isActive('/agent') ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="side-nav-icon" aria-hidden="true"><Icon name="assistant" /></span>
          <span className="side-nav-text">
            <strong>文库 Agent</strong>
            <small>AI 辅助整理论文库</small>
          </span>
        </Link>

        <Link to="/zotero/import" className={`side-nav-item${isActive('/zotero/import') ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="side-nav-icon" aria-hidden="true"><Icon name="library" /></span>
          <span className="side-nav-text">
            <strong>Zotero 导入</strong>
            <small>从 Zotero 导入论文</small>
          </span>
        </Link>
      </nav>

      <div style={{ flex: 1 }} />

      {requiresPassword && (
        <button type="button" className="theme-toggle-btn" onClick={logout} style={{ marginBottom: 8 }}>
          <Icon name="logOut" />
          退出登录
        </button>
      )}

      <button
        type="button"
        className="theme-toggle-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="切换主题"
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        {theme === 'dark' ? '浅色模式' : '深色模式'}
      </button>
    </aside>
  )
}

export default function App() {
  const { isAuthenticated, requiresPassword, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [papers, setPapers] = useState<Paper[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

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
    <div className="shell-layout">
      <Sidebar theme={theme} setTheme={setTheme} />

      <div className="workspace-area">
        <Routes>
          <Route
            path="/"
            element={
              <LibraryPage
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
              <LibraryPage
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
                  <p>带论文上下文的研究对话工作台。</p>
                </div>
                <div className="workspace-header-right">
                  <span className="online-indicator">在线运行</span>
                </div>
              </header>
              <div className="workspace-panel">
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
            <>
              <header className="workspace-header">
                <div className="workspace-title-block">
                  <h1>学术追踪</h1>
                  <p>查看论文处理进度、统计结果和近期变化。</p>
                </div>
                <div className="workspace-header-right">
                  <span className="online-indicator">在线运行</span>
                </div>
              </header>
              <div className="workspace-panel">
                <StatsShell papers={papers} />
              </div>
            </>
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
  )
}
