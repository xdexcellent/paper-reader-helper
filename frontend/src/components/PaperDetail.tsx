import type { Category, PaperDetail as PaperDetailType } from '../types'
import { getPdfBlobUrl, updatePaperTags } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { SummaryCard } from './SummaryCard'
import { Icon } from './UiIcon'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useState, useMemo, useEffect } from 'react'

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
}: {
  paper: PaperDetailType | null
  isLoading?: boolean
  categories?: Category[]
  onCategoryChange?: (categoryId: number) => Promise<void>
  isUpdatingCategory?: boolean
}) {
  const [activeChapter, setActiveChapter] = useState<MainSection | null>(null)
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1)
  const [viewMode, setViewMode] = useState<'content' | 'pdf'>('content')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [localTags, setLocalTags] = useState<string[]>([])

  useEffect(() => {
    setLocalTags(paper?.tags ?? [])
  }, [paper?.id, paper?.tags])

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

  return (
    <div className="paper-detail-content">
      {/* Title & Status */}
      <div className="glass-card paper-title-section">
        <h1 className="paper-title">{paper.title}</h1>
        <div className="paper-status-row">
          <div className="status-group">
            <span className="status-group-label">状态</span>
            <StatusBadge value={paper.status} />
          </div>
          {paper.parse_status && (
            <div className="status-group">
              <span className="status-group-label">解析</span>
              <StatusBadge value={paper.parse_status} />
            </div>
          )}
          {paper.summary_status && (
            <div className="status-group">
              <span className="status-group-label">摘要</span>
              <StatusBadge value={paper.summary_status} />
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn ${viewMode === 'content' ? 'btn-primary' : 'btn-action'}`}
              onClick={() => setViewMode('content')}
              style={{ height: 32, padding: '0 12px', fontSize: 13 }}
            ><Icon name="fileText" />内容</button>
            <button
              type="button"
              className={`btn ${viewMode === 'pdf' ? 'btn-primary' : 'btn-action'}`}
              onClick={() => setViewMode('pdf')}
              style={{ height: 32, padding: '0 12px', fontSize: 13 }}
            ><Icon name="pdf" />PDF 原文</button>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="paper-category-row">
            <label className="paper-category-field" htmlFor="paper-primary-category">
              <span>主分类</span>
              <select
                id="paper-primary-category"
                aria-label="主分类"
                className="paper-search-input paper-category-select"
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
            <div className="paper-category-meta">
              <span className="status-badge">
                {paper.category_status === 'manual_locked' ? '手动锁定' : paper.category_status === 'pending_review' ? '待确认' : '已自动分类'}
              </span>
              <span className="paper-category-confidence">
                置信度 {Math.round((paper.category_confidence ?? 0) * 100)}%
              </span>
            </div>
          </div>
        )}
        {paper.category_reason && (
          <div className="paper-category-reason">{paper.category_reason}</div>
        )}

        {/* Tag Editor */}
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

      {viewMode === 'pdf' ? (
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
      ) : (
        <>

      {/* AI Summary */}
      <SummaryCard
        oneLineSummary={paper.one_line_summary}
        coreContributions={paper.core_contributions}
        methodSummary={paper.method_summary}
        limitations={paper.limitations}
        relevanceNote={paper.relevance_note}
      />

      {/* Hierarchical TOC Grid */}
      <div className="glass-card paper-body-section">
        <div className="section-header">
          <h3 className="section-title">论文核心章节</h3>
          <div className="section-divider" />
        </div>
        {sections.length > 0 ? (
          <div className="toc-grid">
            {sections.map((sec, idx) => (
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
    </div>
  )
}
