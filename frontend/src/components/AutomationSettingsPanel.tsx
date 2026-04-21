import { useEffect, useMemo, useState } from 'react'

import { fetchAutomationSettings, updateAutomationSettings } from '../lib/api'
import type { AutomationSettings } from '../types'

export function AutomationSettingsPanel() {
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
      <button type="button" className="btn btn-action" onClick={() => setOpen(v => !v)}>
        自动化设置
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
