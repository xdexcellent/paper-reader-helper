import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import { Icon } from './UiIcon'

export function LoginPage() {
  const { login, error, isLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password.trim() || submitting) return
    setSubmitting(true)
    try {
      await login(password)
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="loading-spinner" />
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-avatar" aria-hidden="true"><Icon name="book" /></div>
          <h1>论文阅读器</h1>
          <p>请输入密码以继续</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="输入访问密码"
              autoFocus
              disabled={submitting}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={submitting || !password.trim()}
          >
            {submitting ? '验证中...' : '进入系统'}
          </button>
        </form>
      </div>
    </div>
  )
}
