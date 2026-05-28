/**
 * Dashboard dialogs: Automation Settings, Plan Adjustment, Add to Project.
 * Uses shadcn/ui Dialog with the dashboard's light design system.
 */
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { showToast } from './DashboardToast'
import { fetchAutomationSettings, updateAutomationSettings } from '../../lib/api'
import type { AutomationSettings } from '../../types'

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
