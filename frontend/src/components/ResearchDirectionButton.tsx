import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { fetchAutomationSettings, updateAutomationSettings } from '../lib/api'
import type { AutomationSettings } from '../types'
import { Icon } from './UiIcon'

interface ResearchDirectionButtonProps {
  className?: string
  onSaved?: (settings: AutomationSettings) => void | Promise<void>
}

export function ResearchDirectionButton({ className, onSaved }: ResearchDirectionButtonProps) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<AutomationSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [direction, setDirection] = useState('')
  const [keywords, setKeywords] = useState('')

  useEffect(() => {
    if (!open) return
    let ignore = false
    fetchAutomationSettings()
      .then((data) => {
        if (ignore) return
        setSettings(data)
        setDirection(data.research_direction || '')
        setKeywords(data.research_keywords || '')
      })
      .catch(() => {
        if (!ignore) setStatus('设置加载失败')
      })
    return () => {
      ignore = true
    }
  }, [open])

  async function handleSave() {
    if (!settings || saving) return
    setSaving(true)
    setStatus('')
    try {
      const next = await updateAutomationSettings({
        ...settings,
        research_direction: direction,
        research_keywords: keywords,
      })
      setSettings(next)
      if (onSaved) await onSaved(next)
      setStatus('✓ 保存成功')
      setTimeout(() => {
        setOpen(false)
        setStatus('')
      }, 800)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className ?? 'btn btn-action'}
        onClick={() => setOpen(true)}
        title="设置你的研究方向，每日速览将按相关性个性化"
      >
        <Icon name="spark" />
        <span>我的研究方向</span>
      </button>

      {open &&
        createPortal(
          <div className="research-direction-overlay" onClick={() => setOpen(false)}>
            <div className="research-direction-modal" onClick={(e) => e.stopPropagation()}>
              <div className="research-direction-header">
                <h3>
                  <Icon name="spark" /> 我的研究方向
                </h3>
                <button
                  type="button"
                  className="btn btn-action"
                  onClick={() => setOpen(false)}
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>

              <div className="research-direction-body">
                <p className="research-direction-hint">
                  告诉 AI 你的研究方向和感兴趣的关键词，每日速览将：
                </p>
                <ul className="research-direction-hint-list">
                  <li>✓ 按相关性对论文打分排序（关键词命中 +15 分）</li>
                  <li>✓ 话题分类优先展示你关注的方向</li>
                  <li>✓ LLM 生成日报时突出与你研究相关的论文</li>
                </ul>

                <div className="form-group">
                  <label>研究方向描述</label>
                  <textarea
                    rows={3}
                    placeholder="如: 计算机视觉、扩散模型、CS 在医学中的应用（医学影像分割、诊断）"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                  />
                  <p className="form-hint">
                    这段文字会传给 LLM，告诉它你的研究背景，便于生成个性化点评。
                  </p>
                </div>

                <div className="form-group">
                  <label>关键词（逗号分隔）</label>
                  <input
                    type="text"
                    placeholder="如: diffusion, medical image, CT, MRI, segmentation, vision transformer"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                  />
                  <p className="form-hint">
                    支持中英文，逗号 / 顿号分隔。论文命中越多关键词，在日报中排名越靠前。
                  </p>
                </div>

                <div className="research-direction-examples">
                  <strong>快速模板：</strong>
                  <button
                    type="button"
                    className="status-badge"
                    onClick={() => {
                      setDirection('计算机视觉、扩散模型、CS 在医学中的应用')
                      setKeywords(
                        'diffusion, vision transformer, medical image, segmentation, CT, MRI, radiology, image generation',
                      )
                    }}
                  >
                    CV + 扩散 + 医学
                  </button>
                  <button
                    type="button"
                    className="status-badge"
                    onClick={() => {
                      setDirection('大语言模型、RAG、智能体')
                      setKeywords('llm, large language model, rag, retrieval, agent, reasoning')
                    }}
                  >
                    LLM + RAG + Agent
                  </button>
                  <button
                    type="button"
                    className="status-badge"
                    onClick={() => {
                      setDirection('强化学习、机器人')
                      setKeywords('reinforcement learning, rl, robot, manipulation, policy')
                    }}
                  >
                    RL + 机器人
                  </button>
                </div>

                {status && (
                  <div
                    className="research-direction-status"
                    style={{
                      color: status.startsWith('✓') ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}
                  >
                    {status}
                  </div>
                )}
              </div>

              <div className="research-direction-footer">
                <button
                  type="button"
                  className="btn btn-action"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || !settings}
                >
                  {saving ? '保存中...' : '保存设置'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
