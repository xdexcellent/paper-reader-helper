import { useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BarChart3,
  Building2,
  Clock3,
  Eye,
  EyeOff,
  FileSearch,
  FileText,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Radio,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from './AuthContext'
import { Icon } from './UiIcon'

export function LoginPage() {
  const { login, error, isLoading } = useAuth()
  const [account, setAccount] = useState(() => localStorage.getItem('saved_account') ?? '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => localStorage.getItem('remember_me') === 'true')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!account.trim() || !password.trim() || submitting) return
    setSubmitting(true)
    try {
      const success = await login(account, password, remember)
      if (success) {
        if (remember) {
          localStorage.setItem('saved_account', account.trim())
          localStorage.setItem('remember_me', 'true')
        } else {
          localStorage.removeItem('saved_account')
          localStorage.removeItem('remember_me')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-loading-card">
          <div className="loading-spinner" />
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-left-panel" aria-hidden="true">
        <div className="login-brand-block">
          <div className="login-logo">
            <Icon name="rss" />
          </div>
          <div>
            <h1>论文阅读器</h1>
            <p>AI 驱动的学术研究助手</p>
          </div>
        </div>

        <div className="login-feature-list">
          <div className="login-feature-item">
            <span className="login-feature-icon login-feature-icon-blue"><FileSearch size={24} /></span>
            <div>
              <h2>智能论文解析</h2>
              <p>AI 深度理解论文内容，快速提炼核心要点与结论</p>
            </div>
          </div>
          <div className="login-feature-item">
            <span className="login-feature-icon login-feature-icon-green"><BarChart3 size={24} /></span>
            <div>
              <h2>学术追踪与趋势分析</h2>
              <p>追踪领域最新进展，洞察研究趋势与热点方向</p>
            </div>
          </div>
          <div className="login-feature-item">
            <span className="login-feature-icon login-feature-icon-purple"><MessageSquareText size={24} /></span>
            <div>
              <h2>AI 研究助手对话</h2>
              <p>与 AI 助手对话，解答问题，生成研究摘要与建议</p>
            </div>
          </div>
        </div>

        <div className="login-overview-card">
          <div className="login-overview-head">
            <h2>今日工作概览</h2>
          </div>
          <div className="login-kpi-grid">
            <div className="login-kpi-card">
              <span>论文总数</span>
              <strong>1,842</strong>
              <small>较昨日 +24</small>
              <FileText size={20} />
            </div>
            <div className="login-kpi-card">
              <span>阅读进度</span>
              <strong>62%</strong>
              <small>18 / 29 篇</small>
              <i className="login-progress-ring" />
            </div>
            <div className="login-kpi-card">
              <span>待处理队列</span>
              <strong>120</strong>
              <small>较昨日 -15</small>
              <Clock3 size={20} />
            </div>
            <div className="login-kpi-card">
              <span>正在运行中</span>
              <strong>3</strong>
              <small>较昨日 +1</small>
              <Radio size={20} />
            </div>
          </div>

          <div className="login-paper-list">
            <div className="login-paper-list-head">
              <h3>近期阅读论文</h3>
              <span>查看全部 <ArrowRight size={13} /></span>
            </div>
            <PreviewPaper
              title="Solving Physics Olympiad via Reinforcement Learning..."
              meta="arXiv · 2501.12345v1 · 2025-01-20"
              status="已读 86%"
              tone="blue"
            />
            <PreviewPaper
              title="Scaling Test-Time Compute via Multi-Agent Synergy"
              meta="arXiv · 2026-05-10"
              status="正在阅读"
              tone="green"
            />
            <PreviewPaper
              title="高分辨率图像生成的扩散架构研究"
              meta="NeurIPS 2026 · 2026-05-07"
              status="待阅读"
              tone="purple"
            />
          </div>
        </div>
      </div>

      <div className="login-right-panel">
        <form onSubmit={handleSubmit} className="login-card" aria-label="登录表单">
          <div className="login-card-head">
            <h2>欢迎回来</h2>
            <p>登录后继续阅读论文、追踪项目进展与生成研究摘要</p>
          </div>

          <label className="login-field">
            <span>邮箱 / 账号</span>
            <div className="login-input-wrap">
              <Mail size={20} />
              <input
                type="text"
                value={account}
                onChange={e => setAccount(e.target.value)}
                placeholder="请输入邮箱或账号"
                autoComplete="username"
                disabled={submitting}
              />
            </div>
          </label>

          <label className="login-field">
            <span>密码</span>
            <div className="login-input-wrap">
              <LockKeyhole size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoFocus
                autoComplete="current-password"
                disabled={submitting}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword(prev => !prev)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                disabled={submitting}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <div className="login-form-row">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
              />
              <span>记住我</span>
            </label>
            <button type="button" className="login-link-button">忘记密码？</button>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="login-submit"
            disabled={submitting || !account.trim() || !password.trim()}
          >
            <ArrowRight size={20} />
            {submitting ? '验证中...' : '登录'}
          </button>

          <div className="login-divider"><span>或</span></div>

          <button type="button" className="login-org-button">
            <Building2 size={21} />
            使用机构账号登录
          </button>

          <p className="login-apply">
            还没有账号？ <button type="button">申请试用</button>
          </p>
        </form>

        <div className="login-footer-note">
          <ShieldCheck size={17} />
          <span>数据安全</span>
          <span>·</span>
          <span>隐私保护</span>
          <span>·</span>
          <span>学术诚信</span>
        </div>
      </div>
    </div>
  )
}

function PreviewPaper({
  title,
  meta,
  status,
  tone,
}: {
  title: string
  meta: string
  status: string
  tone: 'blue' | 'green' | 'purple'
}) {
  return (
    <div className="login-paper-item">
      <div className="login-paper-thumb" />
      <div className="login-paper-copy">
        <strong>{title}</strong>
        <div>
          <span>多智能体</span>
          <span>物理推理</span>
        </div>
        <p>{meta}</p>
      </div>
      <em className={`login-paper-status login-paper-status-${tone}`}>{status}</em>
    </div>
  )
}
