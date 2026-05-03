import { useEffect, useMemo, useState } from 'react'

import { fetchAutomationSettings, updateAutomationSettings } from '../lib/api'
import type { AutomationSettings } from '../types'

export function AutomationSettingsPanel({
  onSaved,
  buttonClassName,
  buttonLabel = '自动化设置',
}: {
  onSaved?: (settings: AutomationSettings) => void | Promise<void>
  buttonClassName?: string
  buttonLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<AutomationSettings | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let ignore = false
    fetchAutomationSettings()
      .then((data) => {
        if (!ignore) setSettings(data)
      })
      .catch(() => {
        if (!ignore) setStatus('设置加载失败')
      })
    return () => {
      ignore = true
    }
  }, [])

  const scheduleSummary = useMemo(() => {
    if (!settings) return ''
    if (!settings.enabled || !settings.briefing_enabled) return '当前自动化未启用'
    return `每天 ${settings.schedule_time} ${settings.timezone} 自动生成`
  }, [settings])

  async function handleSave() {
    if (!settings || saving) return
    setSaving(true)
    setStatus('')
    try {
      const next = await updateAutomationSettings(settings)
      setSettings(next)
      if (onSaved) {
        await onSaved(next)
      }
      setStatus('设置已保存')
      setOpen(false)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '设置保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="automation-settings">
      <button
        type="button"
        className={buttonClassName ?? 'btn btn-action'}
        onClick={() => setOpen(v => !v)}
      >
        {buttonLabel}
      </button>
      {open && settings ? (
        <div className="automation-settings-card">
          <label className="automation-settings-checkbox">
            <input
              aria-label="启用自动化"
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
            />
            <span>启用自动化</span>
          </label>
          <label className="automation-settings-checkbox">
            <input
              aria-label="启用每日简报"
              type="checkbox"
              checked={settings.briefing_enabled}
              onChange={(event) => setSettings({ ...settings, briefing_enabled: event.target.checked })}
            />
            <span>启用每日简报</span>
          </label>
          <label className="automation-settings-checkbox">
            <input
              aria-label="显示相关项目"
              type="checkbox"
              checked={settings.project_sidebar_enabled}
              onChange={(event) => setSettings({ ...settings, project_sidebar_enabled: event.target.checked })}
            />
            <span>显示相关项目</span>
          </label>
          <label>
            <span>生成时间</span>
            <input
              aria-label="生成时间"
              type="time"
              value={settings.schedule_time}
              onChange={(event) => setSettings({ ...settings, schedule_time: event.target.value })}
            />
          </label>
          <label>
            <span>时区</span>
            <input
              aria-label="时区"
              value={settings.timezone}
              onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
            />
          </label>
          <label>
            <span>Top N</span>
            <input
              aria-label="Top N"
              min={1}
              max={20}
              type="number"
              value={settings.top_n}
              onChange={(event) => setSettings({ ...settings, top_n: Number(event.target.value) })}
            />
          </label>
          <div className="automation-settings-section">
            <h4>代理设置（用于访问 HuggingFace、GitHub 等外部服务）</h4>
            <p className="automation-settings-summary">
              如果后台出现 WinError 10061，通常表示代理地址已被使用，但本机代理程序未启动或端口不一致。
            </p>
            <label>
              <span>HTTP Proxy</span>
              <input
                aria-label="HTTP Proxy"
                type="text"
                placeholder="http://127.0.0.1:7890"
                value={settings.http_proxy || ''}
                onChange={(event) => setSettings({ ...settings, http_proxy: event.target.value || null })}
              />
            </label>
            <label>
              <span>HTTPS Proxy</span>
              <input
                aria-label="HTTPS Proxy"
                type="text"
                placeholder="http://127.0.0.1:7890"
                value={settings.https_proxy || ''}
                onChange={(event) => setSettings({ ...settings, https_proxy: event.target.value || null })}
              />
            </label>
          </div>
          {scheduleSummary ? <div className="automation-settings-summary">{scheduleSummary}</div> : null}
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
            {saving ? '保存中' : '保存设置'}
          </button>
        </div>
      ) : null}
      {status ? <div className="automation-settings-status">{status}</div> : null}
    </div>
  )
}
