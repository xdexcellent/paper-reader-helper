/**
 * Dashboard dialogs: Automation Settings, Plan Adjustment, Add to Project.
 * Uses shadcn/ui Dialog with the dashboard's light design system.
 */
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { showToast } from './DashboardToast'
import {
  fetchAiProviderModels,
  fetchAiProviderSettings,
  fetchAutomationSettings,
  fetchEasyScholarSettings,
  fetchVenueRanksStatus,
  refreshVenueRanks,
  updateAiProviderSettings,
  updateAutomationSettings,
  updateEasyScholarSettings,
} from '../../lib/api'
import { notifyAiProviderSettingsChanged } from '../../lib/aiModels'
import type { AiProviderSettings, AutomationSettings, EasyScholarSettings } from '../../types'
import type { VenueRanksStatus } from '../../lib/api'

// ─── Automation Settings Dialog ─────────────────────────────────────

type AutomationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AutomationSettingsDialog({ open, onOpenChange }: AutomationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<AutomationSettings>({
    enabled: true,
    schedule_time: '08:00',
    timezone: 'Asia/Shanghai',
    top_n: 30,
    briefing_enabled: true,
    project_sidebar_enabled: true,
  })
  const [loaded, setLoaded] = useState(false)

  // Load settings when dialog opens
  async function loadSettings() {
    if (loaded) return
    setLoading(true)
    try {
      const data = await fetchAutomationSettings()
      setSettings(data)
      setLoaded(true)
    } catch (e) {
      showToast('加载设置失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setLoading(true)
    try {
      await updateAutomationSettings(settings)
      showToast('设置已保存', 'success')
      onOpenChange(false)
    } catch (e) {
      showToast('保存失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Load on open
  if (open && !loaded && !loading) {
    void loadSettings()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[440px] !rounded-2xl !p-0 !bg-white !text-[#0F172A] !ring-[#E2E8F0]" style={{ background: '#FFFFFF', color: '#0F172A' }}>
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="!text-[16px] !font-semibold !text-[#0F172A]">自动化设置</DialogTitle>
          <DialogDescription className="!text-[13px] !text-[#64748B]">配置日报自动生成规则</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4">
          {loading && !loaded ? (
            <div className="py-8 text-center text-[13px] text-[#94A3B8]">加载中...</div>
          ) : (
            <>
              {/* Enable toggle */}
              <label className="flex items-center justify-between">
                <span className="text-[13px] text-[#334155]">开启自动生成</span>
                <input
                  type="checkbox"
                  checked={settings.enabled && settings.briefing_enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked, briefing_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]/20"
                />
              </label>

              {/* Schedule time */}
              <label className="flex items-center justify-between">
                <span className="text-[13px] text-[#334155]">生成时间</span>
                <input
                  type="time"
                  value={settings.schedule_time}
                  onChange={(e) => setSettings({ ...settings, schedule_time: e.target.value })}
                  style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                  className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[13px] text-[#334155] outline-none focus:border-[#2563EB]"
                />
              </label>

              {/* Timezone */}
              <label className="flex items-center justify-between">
                <span className="text-[13px] text-[#334155]">时区</span>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                  className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[13px] text-[#334155] outline-none focus:border-[#2563EB]"
                >
                  <option value="Asia/Shanghai">Asia/Shanghai</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                </select>
              </label>

              {/* Top N */}
              <label className="flex items-center justify-between">
                <span className="text-[13px] text-[#334155]">每日论文上限</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={settings.top_n}
                  onChange={(e) => setSettings({ ...settings, top_n: parseInt(e.target.value) || 30 })}
                  style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                  className="w-20 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[13px] text-[#334155] outline-none focus:border-[#2563EB]"
                />
              </label>

              {/* Project sidebar */}
              <label className="flex items-center justify-between">
                <span className="text-[13px] text-[#334155]">自动保存到项目</span>
                <input
                  type="checkbox"
                  checked={settings.project_sidebar_enabled}
                  onChange={(e) => setSettings({ ...settings, project_sidebar_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]/20"
                />
              </label>
            </>
          )}
        </div>
        <div className="border-t border-[#F1F5F9] px-6 py-3 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-[13px] text-[#64748B] hover:bg-[#F8FAFC]">取消</button>
          <button onClick={handleSave} disabled={loading} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── AI Provider Settings Dialog ───────────────────────────────────

type PreferencesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultAiProviderSettings: AiProviderSettings = {
  provider_name: 'OpenAI Compatible',
  api_base: 'https://api.deepseek.com',
  api_key_set: false,
  api_key_preview: '',
  default_model: 'gpt-5.4',
  available_models: ['gpt-5.4'],
}

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [settings, setSettings] = useState<AiProviderSettings>(defaultAiProviderSettings)
  const [apiKeyInput, setApiKeyInput] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetchAiProviderSettings()
      .then((data) => {
        if (cancelled) return
        setSettings(data)
        setApiKeyInput(data.api_key_preview || '')
      })
      .catch(() => showToast('加载 AI 供应商配置失败', 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleFetchModels() {
    setFetchingModels(true)
    try {
      const models = await fetchAiProviderModels({
        api_base: settings.api_base,
        api_key: apiKeyInput && apiKeyInput !== settings.api_key_preview ? apiKeyInput : undefined,
      })
      const nextDefault = models.includes(settings.default_model)
        ? settings.default_model
        : models[0] || settings.default_model
      setSettings({ ...settings, available_models: models, default_model: nextDefault })
      showToast('模型列表已更新', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '获取模型失败', 'error')
    } finally {
      setFetchingModels(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const apiKeyChanged = apiKeyInput.trim() && apiKeyInput.trim() !== settings.api_key_preview
      const next = await updateAiProviderSettings({
        provider_name: settings.provider_name,
        api_base: settings.api_base,
        api_key: apiKeyChanged ? apiKeyInput.trim() : undefined,
        default_model: settings.default_model,
        available_models: settings.available_models,
      })
      setSettings(next)
      setApiKeyInput(next.api_key_preview || '')
      notifyAiProviderSettingsChanged(next)
      showToast('AI 供应商配置已保存', 'success')
      onOpenChange(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存 AI 供应商配置失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const modelOptions = settings.available_models.length > 0
    ? settings.available_models
    : [settings.default_model].filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[560px] !rounded-2xl !p-0 !bg-white !text-[#0F172A] !ring-[#E2E8F0]" style={{ background: '#FFFFFF', color: '#0F172A' }}>
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="!text-[16px] !font-semibold !text-[#0F172A]">AI 供应商配置</DialogTitle>
          <DialogDescription className="!text-[13px] !text-[#64748B]">配置整个系统默认使用的 AI 供应商</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-[13px] text-[#94A3B8]">加载中...</div>
          ) : (
            <section className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="mb-4">
                <h3 className="text-[14px] font-semibold text-[#0F172A]">AI 供应商</h3>
                <p className="mt-1 text-[12px] text-[#64748B]">支持 OpenAI 兼容的 /v1/chat/completions 与 /v1/models 接口。</p>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-[#334155]">供应商名称</span>
                  <input
                    value={settings.provider_name}
                    onChange={(event) => setSettings({ ...settings, provider_name: event.target.value })}
                    style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] outline-none focus:border-[#2563EB]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-[#334155]">URL</span>
                  <input
                    value={settings.api_base}
                    onChange={(event) => setSettings({ ...settings, api_base: event.target.value })}
                    placeholder="https://api.example.com/v1"
                    style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-[#334155]">API Key</span>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    placeholder={settings.api_key_set ? '已保存 API Key，输入新值可替换' : '输入 API Key'}
                    style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB]"
                  />
                </label>

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-[#334155]">使用模型</span>
                    <select
                      aria-label="选择系统默认模型"
                      value={settings.default_model}
                      onChange={(event) => setSettings({ ...settings, default_model: event.target.value })}
                      style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] outline-none focus:border-[#2563EB]"
                    >
                      {modelOptions.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchingModels || !settings.api_base.trim()}
                    className="self-end rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
                  >
                    {fetchingModels ? '获取中...' : '获取模型'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
        <div className="border-t border-[#F1F5F9] px-6 py-3 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-[13px] text-[#64748B] hover:bg-[#F8FAFC]">取消</button>
          <button onClick={handleSave} disabled={loading || saving} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── User Preferences Dialog ────────────────────────────────────────

type UserPreferencesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserPreferencesDialog({ open, onOpenChange }: UserPreferencesDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [researchDirection, setResearchDirection] = useState('')
  const [researchKeywords, setResearchKeywords] = useState('')
  const [baseSettings, setBaseSettings] = useState<AutomationSettings | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    setLoading(true)
    fetchAutomationSettings()
      .then((data) => {
        if (cancelled) return
        setBaseSettings(data)
        setResearchDirection(data.research_direction ?? '')
        setResearchKeywords(data.research_keywords ?? '')
        setLoaded(true)
      })
      .catch(() => showToast('加载偏好设置失败', 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, loaded])

  async function handleSave() {
    if (!baseSettings) return
    setSaving(true)
    try {
      await updateAutomationSettings({
        ...baseSettings,
        research_direction: researchDirection,
        research_keywords: researchKeywords,
      })
      showToast('偏好设置已保存', 'success')
      onOpenChange(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存偏好设置失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[480px] !rounded-2xl !p-0 !bg-white !text-[#0F172A] !ring-[#E2E8F0]" style={{ background: '#FFFFFF', color: '#0F172A' }}>
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="!text-[16px] !font-semibold !text-[#0F172A]">偏好设置</DialogTitle>
          <DialogDescription className="!text-[13px] !text-[#64748B]">配置研究方向，用于每日简报相关性打分与 AI 提示</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4">
          {loading && !loaded ? (
            <div className="py-8 text-center text-[13px] text-[#94A3B8]">加载中...</div>
          ) : (
            <section className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#334155]">研究方向</span>
                <textarea
                  value={researchDirection}
                  onChange={(event) => setResearchDirection(event.target.value)}
                  placeholder="例如：计算机视觉、扩散模型、CS 在医学中的应用"
                  rows={3}
                  style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB] resize-none"
                />
                <span className="mt-1 block text-[11px] text-[#64748B]">
                  用于每日简报的关键词命中打分（每命中一个 +15，上限 +60）与 AI 生成摘要时的研究方向提示。
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#334155]">研究关键词</span>
                <input
                  value={researchKeywords}
                  onChange={(event) => setResearchKeywords(event.target.value)}
                  placeholder="例如：multimodal, RLHF, retrieval-augmented"
                  style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB]"
                />
                <span className="mt-1 block text-[11px] text-[#64748B]">
                  以英文逗号分隔，与研究方向一并参与相关性命中统计。
                </span>
              </label>
            </section>
          )}
        </div>
        <div className="border-t border-[#F1F5F9] px-6 py-3 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-[13px] text-[#64748B] hover:bg-[#F8FAFC]">取消</button>
          <button onClick={handleSave} disabled={loading || saving} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Plan Adjustment Dialog ─────────────────────────────────────────

type PlanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: (target: number, minutesPerPaper: number) => void
}

export function PlanAdjustmentDialog({ open, onOpenChange, onSave }: PlanDialogProps) {
  const [dailyTarget, setDailyTarget] = useState(() => {
    try { return localStorage.getItem('dashboard_daily_target') || '30' } catch { return '30' }
  })
  const [minutesPerPaper, setMinutesPerPaper] = useState(() => {
    try { return localStorage.getItem('dashboard_minutes_per_paper') || '20' } catch { return '20' }
  })
  const [priorityDirection, setPriorityDirection] = useState('')
  const [excludeTopics, setExcludeTopics] = useState('')

  function handleSave() {
    const target = parseInt(dailyTarget, 10) || 30
    const estimateMinutes = parseInt(minutesPerPaper, 10) || 20
    onSave?.(target, estimateMinutes)
    showToast('阅读目标已更新', 'success')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[440px] !rounded-2xl !p-0 !bg-white !text-[#0F172A] !ring-[#E2E8F0]" style={{ background: '#FFFFFF', color: '#0F172A' }}>
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="!text-[16px] !font-semibold !text-[#0F172A]">调整计划</DialogTitle>
          <DialogDescription className="!text-[13px] !text-[#64748B]">设置今日阅读目标和优先方向</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4">
          <label className="block">
            <span className="text-[13px] text-[#334155] mb-1 block">今日目标（篇）</span>
            <input
              type="number"
              min={1}
              max={100}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
              style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] text-[#334155] outline-none focus:border-[#2563EB]"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-[#334155] mb-1 block">每篇预计阅读时长（分钟）</span>
            <input
              type="number"
              min={5}
              max={180}
              value={minutesPerPaper}
              onChange={(e) => setMinutesPerPaper(e.target.value)}
              style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] text-[#334155] outline-none focus:border-[#2563EB]"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-[#334155] mb-1 block">优先方向</span>
            <input
              type="text"
              placeholder="例如：多模态学习、知识图谱"
              value={priorityDirection}
              onChange={(e) => setPriorityDirection(e.target.value)}
              style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] text-[#334155] placeholder:text-[#94A3B8] outline-none focus:border-[#2563EB]"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-[#334155] mb-1 block">排除主题</span>
            <input
              type="text"
              placeholder="例如：综述、非英文"
              value={excludeTopics}
              onChange={(e) => setExcludeTopics(e.target.value)}
              style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] text-[#334155] placeholder:text-[#94A3B8] outline-none focus:border-[#2563EB]"
            />
          </label>
        </div>
        <div className="border-t border-[#F1F5F9] px-6 py-3 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-[13px] text-[#64748B] hover:bg-[#F8FAFC]">取消</button>
          <button onClick={handleSave} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8]">保存</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Literature Settings Dialog (EasyScholar) ──────────────────────

type LiteratureDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LiteratureSettingsDialog({ open, onOpenChange }: LiteratureDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<EasyScholarSettings>({ api_key_set: false, api_key_preview: '', enabled: true })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [refreshStatus, setRefreshStatus] = useState<VenueRanksStatus | null>(null)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetchEasyScholarSettings()
      .then((data) => {
        if (cancelled) return
        setSettings(data)
        setApiKeyInput(data.api_key_preview || '')
      })
      .catch(() => showToast('加载文献信息设置失败', 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(async () => {
      try {
        const status = await fetchVenueRanksStatus()
        setRefreshStatus(status)
        if (!status.running && (status.pending === 0 || !status.running)) {
          setPolling(false)
        }
      } catch { setPolling(false) }
    }, 2000)
    return () => clearInterval(interval)
  }, [polling])

  async function handleRefresh() {
    setRefreshLoading(true)
    try {
      const result = await refreshVenueRanks()
      showToast(`EasyScholar 刷新已启动，共 ${result.total_venues} 个 venue`, 'success')
      setPolling(true)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '启动刷新失败', 'error')
    } finally {
      setRefreshLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const apiKeyChanged = apiKeyInput.trim() && apiKeyInput.trim() !== settings.api_key_preview
      const next = await updateEasyScholarSettings({
        api_key: apiKeyChanged ? apiKeyInput.trim() : undefined,
        enabled: settings.enabled,
      })
      setSettings(next)
      setApiKeyInput(next.api_key_preview || '')
      showToast('文献信息设置已保存', 'success')
      onOpenChange(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const progressDone = (refreshStatus ? refreshStatus.success + refreshStatus.no_data + refreshStatus.error : 0)
  const progressTotal = refreshStatus ? refreshStatus.total : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[560px] !rounded-2xl !p-0 !bg-white !text-[#0F172A] !ring-[#E2E8F0]" style={{ background: '#FFFFFF', color: '#0F172A' }}>
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="!text-[16px] !font-semibold !text-[#0F172A]">文献信息设置</DialogTitle>
          <DialogDescription className="!text-[13px] !text-[#64748B]">
            配置 EasyScholar API Key 以自动获取期刊的影响因子、JCR 分区、中科院分区、JCI、ESI、预警等信息
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-[13px] text-[#94A3B8]">加载中...</div>
          ) : (
            <section className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-[13px] text-[#334155]">启用 EasyScholar</span>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]/20"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#334155]">API Key</span>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder={settings.api_key_set ? '已保存 API Key，输入新值可替换' : '输入 API Key'}
                  style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB]"
                />
              </label>

              <div className="pt-2 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-medium text-[#334155]">缓存状态</span>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshLoading || !settings.enabled || (refreshStatus?.running ?? false)}
                    className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                  >
                    {refreshLoading || polling ? '刷新中...' : '立即刷新全库'}
                  </button>
                </div>
                {refreshStatus && (
                  <div className="text-[12px] text-[#64748B] space-y-1">
                    <p>已查询 {progressDone} / {progressTotal}，待查 {refreshStatus.pending}，成功 {refreshStatus.success}</p>
                    {refreshStatus.pending > 0 && !refreshStatus.running && (
                      <p className="text-[#EF4444]">今日 EasyScholar 配额可能已用尽，剩余 venue 明天自动继续</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
        <div className="border-t border-[#F1F5F9] px-6 py-3 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-[13px] text-[#64748B] hover:bg-[#F8FAFC]">取消</button>
          <button onClick={handleSave} disabled={loading || saving} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add to Project Dialog ──────────────────────────────────────────

type AddToProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  paperTitle?: string
}

export function AddToProjectDialog({ open, onOpenChange, paperTitle }: AddToProjectDialogProps) {
  const [selectedProject, setSelectedProject] = useState('')

  // TODO: Fetch real projects from API when available
  const projects = [
    { id: 'proj-1', name: '智能文献分析系统' },
    { id: 'proj-2', name: '学术知识图谱' },
    { id: 'proj-3', name: '科研社交网络分析' },
    { id: 'proj-4', name: '引文网络研究' },
    { id: 'proj-5', name: '多语言学术平台' },
  ]

  function handleConfirm() {
    if (!selectedProject) {
      showToast('请选择一个项目', 'error')
      return
    }
    const project = projects.find(p => p.id === selectedProject)
    showToast(`已加入「${project?.name}」`, 'success')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[400px] !rounded-2xl !p-0 !bg-white !text-[#0F172A] !ring-[#E2E8F0]" style={{ background: '#FFFFFF', color: '#0F172A' }}>
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="!text-[16px] !font-semibold !text-[#0F172A]">加入项目</DialogTitle>
          <DialogDescription className="!text-[13px] !text-[#64748B]">
            {paperTitle ? `将「${paperTitle}」加入项目` : '选择目标项目'}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2.5 text-[13px] text-[#334155] outline-none focus:border-[#2563EB]"
          >
            <option value="">选择项目...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="border-t border-[#F1F5F9] px-6 py-3 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-[13px] text-[#64748B] hover:bg-[#F8FAFC]">取消</button>
          <button onClick={handleConfirm} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8]">确认</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
