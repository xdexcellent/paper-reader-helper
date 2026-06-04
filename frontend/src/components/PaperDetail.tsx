import type { Category, PaperDetail as PaperDetailType } from '../types'
import { getPdfBlobUrl, updatePaperTags, translateAbstract } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { SummaryCard } from './SummaryCard'
import { Icon } from './UiIcon'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import React, { useState, useMemo, useEffect } from 'react'

interface SubSection {
  title: string;
  content: string;
}

interface MainSection {
  title: string;
  intro: string; 
  subSections: SubSection[];
}

export function PaperDetail({
  paper,
  isLoading,
  categories = [],
  onCategoryChange,
  isUpdatingCategory,
  onGoBack,
  onPrevPaper,
  onNextPaper,
  hasPrev = false,
  hasNext = false,
}: {
  paper: PaperDetailType | null
  isLoading?: boolean
  categories?: Category[]
  onCategoryChange?: (categoryId: number) => Promise<void>
  isUpdatingCategory?: boolean
  onGoBack?: () => void
  onPrevPaper?: () => void
  onNextPaper?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}) {
  const [activeChapter, setActiveChapter] = useState<MainSection | null>(null)
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1)
  const [viewMode, setViewMode] = useState<'content' | 'pdf'>('content')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [localTags, setLocalTags] = useState<string[]>([])
  const [isSectionsExpanded, setIsSectionsExpanded] = useState(false)
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false)
  const [abstractTranslation, setAbstractTranslation] = useState<string | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)

  const SECTION_COLLAPSE_LIMIT = 6

  useEffect(() => {
    setLocalTags(paper?.tags ?? [])
  }, [paper?.id, paper?.tags])

  useEffect(() => {
    setIsSectionsExpanded(false)
    setIsSummaryExpanded(false)
    setAbstractTranslation(null)
    setShowTranslation(false)
  }, [paper?.id])

  useEffect(() => {
    setActiveSubIndex(-1)
  }, [activeChapter])

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [isPdfLoading, setIsPdfLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (viewMode === 'pdf' && paper?.id && !pdfBlobUrl) {
      setIsPdfLoading(true)
      getPdfBlobUrl(paper.id)
        .then(url => {
          if (active) setPdfBlobUrl(url)
        })
        .catch(console.error)
        .finally(() => {
          if (active) setIsPdfLoading(false)
        })
    }
    return () => {
      active = false
    }
  }, [viewMode, paper?.id, pdfBlobUrl])

  useEffect(() => {
    // Revoke previous blob URL when paper changes or component unmounts
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl)
      }
    }
  }, [paper?.id]) // Important: only cleanup when paper changes or unmounts

  // Also reset pdfBlobUrl when paper changes
  useEffect(() => {
    setPdfBlobUrl(null)
  }, [paper?.id])

  const rawBodyText = paper?.full_markdown?.replace(/^# .*\n\n/, '') ?? ''

  const sections = useMemo(() => {
    if (!rawBodyText) return []

    const lines = rawBodyText.split('\n')
    const foundsections: { title: string; content: string; level: number }[] = []
    
    // Step 1: Extract all headers and their content blocks
    const headerRegex = /^(#{1,6})\s+(.*)$/
    let curTitle = '引言 / 概要'
    let curLevel = 1
    let curContent: string[] = []

    for (const line of lines) {
      const match = line.match(headerRegex)
      if (match) {
        // Save previous
        foundsections.push({ 
          title: curTitle, 
          content: curContent.join('\n').trim(), 
          level: curLevel 
        })
        // Start new
        curTitle = match[2].trim()
        
        // Logical Leveling overrides
        const t = curTitle.trim()
        if (/^(摘要|结论|引言|参考文献|致谢|目录|附录|Abstract|References)/i.test(t)) {
          curLevel = 1
        } else if (/^第[0-9一二三四五六七八九十百]+章/.test(t) || /^[一二三四五六七八九十]+、/.test(t)) {
          curLevel = 1
        } else if (/^\d+\.\d+\.\d+(?:[\.\s]|$)/.test(t)) {
          curLevel = 3
        } else if (/^\d+\.\d+(?:[\.\s]|$)/.test(t)) {
          curLevel = 2
        } else if (/^\d+(?:[\.\s]|$)/.test(t)) {
          curLevel = 1
        } else if (/^\(\d+\)|^（\d+）|^\d+\)/.test(t)) {
          curLevel = 4
        } else {
          // Fallback to markdown hash count if no clear pattern
          curLevel = match[1].length
        }
        curContent = []
      } else {
        curContent.push(line)
      }
    }
    // Last one
    foundsections.push({ title: curTitle, content: curContent.join('\n').trim(), level: curLevel })

    // Step 2: Global Deduplication & Hierarchy Mapping
    const mainMap = new Map<string, MainSection>()
    const mainOrder: string[] = []

    const normalize = (t: string) => {
      let n = t.toLowerCase().replace(/[.。:：\s\d]+$/, '').trim()
      // Synonym Map
      if (n === 'abstract' || n === 'summary') return '摘要'
      if (n === 'contents' || n === 'index') return '目录'
      if (n === 'conclusion' || n === 'conclusions') return '结论'
      if (n === 'introduction' || n === 'background') return '引言'
      if (n === 'references') return '参考文献'
      return n
    }

    let currentMain: MainSection | null = null

    for (const fs of foundsections) {
      if (!fs.content && !fs.title) continue
      
      const norm = normalize(fs.title)
      const isLevel1 = fs.level === 1 || norm === '摘要' || norm === '结论' || norm === '引言' || norm === '参考文献'

      if (isLevel1) {
        if (mainMap.has(norm)) {
          currentMain = mainMap.get(norm)!
          if (fs.content) currentMain.intro += '\n\n' + fs.content
        } else {
          currentMain = { title: fs.title, intro: fs.content, subSections: [] }
          mainMap.set(norm, currentMain)
          mainOrder.push(norm)
        }
      } else {
        // It's a sub-section
        if (!currentMain) {
          // Orphan sub-section, create a dummy main if needed
          currentMain = { title: '其他内容', intro: '', subSections: [] }
          mainMap.set('others', currentMain)
          mainOrder.push('others')
        }
        currentMain.subSections.push({ title: fs.title, content: fs.content })
      }
    }

    return mainOrder.map(key => mainMap.get(key)!).filter(s => s.intro || s.subSections.length > 0)
  }, [rawBodyText])

  if (isLoading) {
    return (
      <div className="paper-detail-loading">
        <div className="loading-spinner" />
        <span>加载论文详情中...</span>
      </div>
    )
  }

  if (!paper) {
    return (
      <div className="paper-detail-empty">
        <div className="empty-icon"><Icon name="library" /></div>
        <div className="empty-title">选择一篇论文</div>
        <div className="empty-desc">请选择左侧论文，或先导入新论文</div>
      </div>
    )
  }

  /** Helper: get status pill style based on paper status */
  const getStatusPillStyle = (status: string) => {
    const normalized = status?.toLowerCase() ?? ''
    if (normalized.includes('done') || normalized.includes('completed') || normalized.includes('success')) {
      return 'detail-status-pill--green'
    }
    if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('fail')) {
      return 'detail-status-pill--red'
    }
    if (normalized.includes('processing') || normalized.includes('running') || normalized.includes('pending')) {
      return 'detail-status-pill--yellow'
    }
    return 'detail-status-pill--default'
  }

  return (
    <div className="paper-detail-content">
      {/* 1. Detail_Nav_Bar */}
      <div className="detail-nav-bar">
        <button type="button" className="detail-nav-btn" onClick={onGoBack}>
          ← 返回列表
        </button>
        <div className="detail-nav-arrows">
          <button type="button" className="detail-nav-btn" onClick={onPrevPaper} disabled={!hasPrev}>
            ← 上一篇
          </button>
          <button type="button" className="detail-nav-btn" onClick={onNextPaper} disabled={!hasNext}>
            下一篇 →
          </button>
        </div>
      </div>

      {/* 2. Title + Status_Pill */}
      <div className="detail-title-section">
        <h1 className="detail-title">{paper.title}</h1>
        <div className="detail-title-meta">
          <span className={`detail-status-pill ${getStatusPillStyle(paper.status)}`}>
            <StatusBadge value={paper.status} />
          </span>
          {paper.authors && <span className="paper-meta-item">{paper.authors}</span>}
          {paper.year && <span className="paper-meta-item">{paper.year}</span>}
          {paper.source && <span className="paper-meta-item">{paper.source}</span>}
        </div>
      </div>

      {/* 3. Action Buttons Row */}
      <div className="detail-actions-row">
        <button
          type="button"
          className="detail-action-btn detail-action-btn--primary"
          onClick={() => window.open(`/paper/${paper.id}/reader`, '_blank', 'noopener')}
        >
          <Icon name="pdf" />打开阅读器
        </button>
        <button
          type="button"
          className="detail-action-btn detail-action-btn--secondary"
          onClick={() => document.getElementById('paper-sections-anchor')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <Icon name="fileText" />内容视图
        </button>
        {categories.length > 0 && (
          <label className="detail-category-select" htmlFor="paper-primary-category">
            <span className="detail-category-label">主分类</span>
            <select
              id="paper-primary-category"
              aria-label="主分类"
              className="detail-category-dropdown"
              value={paper.primary_category_id ?? ''}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                if (Number.isNaN(nextValue) || !onCategoryChange) return
                void onCategoryChange(nextValue)
              }}
              disabled={isUpdatingCategory}
            >
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* 4. Abstract + AI Summary Grid */}
      <div className="detail-abstract-card glass-card">
        <div className="abstract-header">
          <div className="abstract-badge">
            <span className="ai-dot" />
            摘要
          </div>
          <button
            type="button"
            className={`abstract-translate-btn${showTranslation ? ' active' : ''}`}
            disabled={isTranslating}
            onClick={async () => {
              if (abstractTranslation) {
                setShowTranslation(prev => !prev)
              } else {
                setIsTranslating(true)
                try {
                  const result = await translateAbstract(paper.id)
                  setAbstractTranslation(result.translated_text)
                  setShowTranslation(true)
                } catch {
                  // silently fail
                } finally {
                  setIsTranslating(false)
                }
              }
            }}
          >
            {isTranslating ? '翻译中...' : showTranslation ? '显示原文' : '翻译为中文'}
          </button>
        </div>
        <div className={`abstract-content summary-clamp${isSummaryExpanded ? ' expanded' : ''}`}>
          {showTranslation && abstractTranslation
            ? abstractTranslation
            : (paper.abstract_md || paper.one_line_summary || '暂无摘要内容')}
        </div>
        {(paper.abstract_md || paper.one_line_summary) && (
          <button
            type="button"
            className="summary-expand-link"
            onClick={() => setIsSummaryExpanded(prev => !prev)}
          >
            {isSummaryExpanded ? '收起' : '展开全文'}
          </button>
        )}
      </div>

      {/* AI Summary Grid - 四格卡片 */}
      {(paper.core_contributions || paper.method_summary || paper.limitations || paper.relevance_note) && (
        <div className="glass-card ai-summary-grid-card">
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-item-label contributions">
                <Icon name="target" className="label-icon" />
                核心贡献
              </div>
              <div className="summary-item-content">
                {paper.core_contributions || '暂无内容'}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-item-label method">
                <Icon name="gear" className="label-icon" />
                方法概述
              </div>
              <div className="summary-item-content">
                {paper.method_summary || '暂无内容'}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-item-label limitations">
                <Icon name="warning" className="label-icon" />
                局限性
              </div>
              <div className="summary-item-content">
                {paper.limitations || '暂无内容'}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-item-label relevance">
                <Icon name="link" className="label-icon" />
                相关性注记
              </div>
              <div className="summary-item-content">
                {paper.relevance_note || '暂无内容'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Processing_Timeline */}
      <div className="processing-timeline-section">
        <h3 className="section-label">处理流程</h3>
        <div className="processing-timeline">
          {(() => {
            const steps = [
              { label: '导入', completed: true, time: paper.updated_at },
              { label: '解析', completed: paper.parse_status === 'done' || paper.parse_status === 'completed', time: paper.updated_at },
              { label: '摘要生成', completed: paper.summary_status === 'done' || paper.summary_status === 'completed', time: paper.updated_at },
              { label: '向量化', completed: paper.embedding_status === 'done' || paper.embedding_status === 'completed', time: paper.updated_at },
            ]
            return steps.map((step, i) => (
              <React.Fragment key={step.label}>
                <div className={`timeline-card ${step.completed ? 'completed' : ''}`}>
                  <div className="timeline-card-header">
                    <span className="timeline-card-label">{step.label}</span>
                    {step.completed && (
                      <svg className="timeline-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="16 9 10.5 15 8 12.5" />
                      </svg>
                    )}
                  </div>
                  {step.completed && step.time && (
                    <div className="timeline-card-time">{new Date(step.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  )}
                </div>
                {i < steps.length - 1 && <div className="timeline-connector">→</div>}
              </React.Fragment>
            ))
          })()}
        </div>
      </div>

      {/* 6. Tag Editor */}
      <div className="detail-tag-editor-section">
        <div className="tag-editor">
          {localTags.map(tag => (
            <span key={tag} className="tag-editor-pill">
              {tag}
              <button
                type="button"
                className="tag-editor-remove"
                onClick={async () => {
                  const updated = localTags.filter(t => t !== tag)
                  setLocalTags(updated)
                  try { await updatePaperTags(paper.id, updated) } catch {}
                }}
              >×</button>
            </span>
          ))}
          {isAddingTag ? (
            <input
              className="tag-editor-input"
              value={newTagInput}
              onChange={e => setNewTagInput(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && newTagInput.trim()) {
                  const updated = [...localTags, newTagInput.trim()]
                  setLocalTags(updated)
                  setNewTagInput('')
                  setIsAddingTag(false)
                  try { await updatePaperTags(paper.id, updated) } catch {}
                } else if (e.key === 'Escape') {
                  setIsAddingTag(false)
                  setNewTagInput('')
                }
              }}
              onBlur={() => { setIsAddingTag(false); setNewTagInput('') }}
              autoFocus
              placeholder="输入标签..."
            />
          ) : (
            <button
              type="button"
              className="tag-editor-add"
              onClick={() => setIsAddingTag(true)}
            >+ 添加标签</button>
          )}
        </div>
      </div>

      {/* PDF View Mode */}
      {viewMode === 'pdf' && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24, position: 'relative' }}>
          {isPdfLoading && (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              文档安全加载中...
            </div>
          )}
          {pdfBlobUrl && (
            <iframe
              src={pdfBlobUrl}
              title="PDF 预览"
              style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
            />
          )}
        </div>
      )}

      {/* Content View Mode - Hierarchical TOC Grid */}
      {viewMode === 'content' && (
        <>
          <div className="glass-card paper-body-section" id="paper-sections-anchor">
            <div className="section-header">
              <h3 className="section-title">论文核心章节</h3>
              <div className="section-divider" />
            </div>
            {sections.length > 0 ? (
              <>
                <div className="toc-grid" style={{ transition: 'max-height 250ms ease-in-out, opacity 250ms ease-in-out' }}>
                  {(isSectionsExpanded ? sections : sections.slice(0, SECTION_COLLAPSE_LIMIT)).map((sec, idx) => (
                    <div key={idx} className="toc-card" onClick={() => setActiveChapter(sec)}>
                      <div className="toc-index">{idx + 1}</div>
                      <div className="toc-info">
                        <h4 className="toc-title">{sec.title}</h4>
                        {sec.subSections.length > 0 && (
                          <span className="toc-subtitle">{sec.subSections.length} 个子话题</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {sections.length > SECTION_COLLAPSE_LIMIT && (
                  <button
                    type="button"
                    className="section-toggle-btn"
                    onClick={() => setIsSectionsExpanded(prev => !prev)}
                  >
                    {isSectionsExpanded ? '收起章节' : '展开全部章节'}
                  </button>
                )}
              </>
            ) : (
              <div className="empty-desc" style={{ textAlign: 'center', padding: '32px 0' }}>暂无正文结构</div>
            )}
          </div>

          {/* Multi-level Reading Modal */}
          {activeChapter && (
            <div className="chapter-modal-overlay" onClick={() => setActiveChapter(null)}>
              <div className="chapter-modal-content glass-card wide" onClick={e => e.stopPropagation()}>
                <div className="chapter-modal-header">
                  <div className="header-labels">
                    <span className="modal-label">深度阅读</span>
                    <h3 className="chapter-modal-title">{activeChapter.title}</h3>
                  </div>
                  <button 
                    type="button" 
                    className="chapter-modal-close" 
                    onClick={() => setActiveChapter(null)}
                    aria-label="关闭章节阅读"
                  ><Icon name="close" /></button>
                </div>
                
                <div className="chapter-modal-split-layout">
                  {activeChapter.subSections.length > 0 && (
                    <aside className="chapter-modal-sidebar">
                      <div 
                        className={`sub-nav-item ${activeSubIndex === -1 ? 'active' : ''}`}
                        onClick={() => setActiveSubIndex(-1)}
                      >
                        主要阐述 / 导读
                      </div>
                      {activeChapter.subSections.map((sub, i) => (
                        <div 
                          key={i} 
                          className={`sub-nav-item ${activeSubIndex === i ? 'active' : ''}`}
                          onClick={() => setActiveSubIndex(i)}
                        >
                          {sub.title}
                        </div>
                      ))}
                    </aside>
                  )}

                  <div className="chapter-modal-body prose">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                    >
                      {activeSubIndex === -1 || activeChapter.subSections.length === 0
                        ? activeChapter.intro 
                        : activeChapter.subSections[activeSubIndex].content}
                    </ReactMarkdown>
                    
                    {(activeSubIndex === -1 && !activeChapter.intro && activeChapter.subSections.length > 0) && (
                       <div className="empty-sub-tip">请从左侧选择子章节开始阅读</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Category metadata (preserved from original) */}
      {categories.length > 0 && paper.category_status && (
        <div className="detail-category-meta-section">
          <div className="paper-category-meta">
            <span className="status-badge">
              {paper.category_status === 'manual_locked' ? '手动锁定' : paper.category_status === 'pending_review' ? '待确认' : '已自动分类'}
            </span>
            <span className="paper-category-confidence">
              置信度 {Math.round((paper.category_confidence ?? 0) * 100)}%
            </span>
          </div>
          {paper.category_reason && (
            <div className="paper-category-reason">{paper.category_reason}</div>
          )}
        </div>
      )}
    </div>
  )
}
