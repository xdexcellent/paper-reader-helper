import { useEffect, useState, type FormEvent } from 'react'

import { effectiveRank, type Category, type PaperDetail, type PaperUpdatePayload, type ReadingStatus } from '../../types'
import type { AiModelOption } from '../../lib/aiModels'
import { RankBadge } from '../RankBadge'
import { StatusBadge } from '../StatusBadge'
import { Icon } from '../UiIcon'
import { PaperTagEditor } from './PaperTagEditor'

type PaperMetadataPanelProps = {
  paper: PaperDetail | null
  categories: Category[]
  isLoading: boolean
  isUpdatingCategory: boolean
  isRunningParse: boolean
  isRunningSummarize: boolean
  isRunningEmbed: boolean
  selectedModel: string
  modelOptions: AiModelOption[]
  onCategoryChange: (categoryId: number) => Promise<void> | void
  onTagsChange?: (tags: string[]) => Promise<void> | void
  onOpenReader?: (paper: PaperDetail) => void
  onMetadataSave?: (payload: PaperUpdatePayload) => Promise<void> | void
  onFavoriteChange?: (favorite: boolean) => Promise<void> | void
  onReadingStateChange?: (payload: {
    reading_status: ReadingStatus
    reading_progress: number
  }) => Promise<void> | void
  onNotesSave?: (userNotes: string) => Promise<void> | void
  onModelChange: (model: string) => void
  onParse: () => Promise<void>
  onSummarize: () => Promise<void>
  onEmbed: () => Promise<void>
  onRefreshDetail: () => Promise<void>
}

type MetadataForm = {
  title: string
  authors: string
  year: string
  venue: string
  doi: string
  url: string
  abstract_raw: string
}

const emptyMetadata: MetadataForm = {
  title: '',
  authors: '',
  year: '',
  venue: '',
  doi: '',
  url: '',
  abstract_raw: '',
}

const readingOptions: { value: ReadingStatus; label: string }[] = [
  { value: 'unread', label: '未读' },
  { value: 'reading', label: '阅读中' },
  { value: 'read', label: '已读' },
  { value: 'skipped', label: '已跳过' },
]

const metadataFields: {
  field: Exclude<keyof MetadataForm, 'abstract_raw'>
  label: string
  inputMode?: 'numeric'
}[] = [
  { field: 'title', label: '标题' },
  { field: 'authors', label: '作者' },
  { field: 'year', label: '年份', inputMode: 'numeric' },
  { field: 'venue', label: '期刊/会议' },
  { field: 'doi', label: 'DOI' },
  { field: 'url', label: 'URL' },
]

function metadataFromPaper(paper: PaperDetail | null): MetadataForm {
  if (!paper) return emptyMetadata
  return {
    title: paper.title,
    authors: paper.authors ?? '',
    year: paper.year == null ? '' : String(paper.year),
    venue: paper.venue ?? '',
    doi: paper.doi ?? '',
    url: paper.url ?? '',
    abstract_raw: paper.abstract_raw ?? '',
  }
}

function findCategoryName(categories: Category[], categoryId: number | null | undefined): string | null {
  if (categoryId == null) return null
  return categories.find((c) => c.id === categoryId)?.name ?? null
}

function readingStatusLabel(status: ReadingStatus): string {
  const map: Record<ReadingStatus, string> = {
    unread: '未读',
    reading: '阅读中',
    read: '已读',
    skipped: '已跳过',
  }
  return map[status] || status
}

export function PaperMetadataPanel({
  paper,
  categories,
  isLoading,
  isUpdatingCategory,
  isRunningParse,
  isRunningSummarize,
  isRunningEmbed,
  selectedModel,
  modelOptions,
  onCategoryChange,
  onTagsChange,
  onOpenReader,
  onMetadataSave,
  onFavoriteChange,
  onReadingStateChange,
  onNotesSave,
  onModelChange,
  onParse,
  onSummarize,
  onEmbed,
  onRefreshDetail,
}: PaperMetadataPanelProps) {
  const [metadata, setMetadata] = useState<MetadataForm>(emptyMetadata)
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>('unread')
  const [readingProgress, setReadingProgress] = useState('0')
  const [notes, setNotes] = useState('')
  const [notesError, setNotesError] = useState('')
  const [rankOverrides, setRankOverrides] = useState({ ccf: '', sciZone: '', impactFactor: '' })

  useEffect(() => {
    setMetadata(metadataFromPaper(paper))
    setReadingStatus(paper?.reading_status ?? 'unread')
    setReadingProgress(String(paper?.reading_progress ?? 0))
    setNotes(paper?.user_notes ?? '')
    setNotesError('')
    setRankOverrides({
      ccf: paper?.ccf_rank_override ?? '',
      sciZone: paper?.sci_zone_override ?? '',
      impactFactor: paper?.impact_factor_override ?? '',
    })
  }, [paper?.id, paper?.tags])

  if (isLoading) {
    return (
      <section className="paper-metadata-panel" aria-busy="true">
        <span className="spinner" />
        <span>加载论文元数据...</span>
      </section>
    )
  }

  if (!paper) {
    return (
      <section className="paper-metadata-panel paper-panel-empty">
        <Icon name="library" />
        <span>选择一篇论文查看详情和管理状态。</span>
      </section>
    )
  }

  const primaryCategoryName = findCategoryName(categories, paper.primary_category_id)
  const rank = effectiveRank(paper)

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onMetadataSave?.({
      title: metadata.title,
      authors: metadata.authors,
      year: metadata.year.trim() ? Number(metadata.year) : null,
      venue: metadata.venue,
      doi: metadata.doi,
      url: metadata.url,
      abstract_raw: metadata.abstract_raw,
    })
  }

  async function saveReadingState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onReadingStateChange?.({
      reading_status: readingStatus,
      reading_progress: Number(readingProgress),
    })
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotesError('')
    try {
      await onNotesSave?.(notes)
    } catch {
      setNotesError('笔记保存失败')
    }
  }

  async function saveRankOverrides(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onMetadataSave?.({
      ccf_rank_override: rankOverrides.ccf.trim(),
      sci_zone_override: rankOverrides.sciZone.trim(),
      impact_factor_override: rankOverrides.impactFactor.trim(),
    })
  }

  function updateMetadata(field: keyof MetadataForm, value: string) {
    setMetadata((current) => ({ ...current, [field]: value }))
  }

  const isBusy = isRunningParse || isRunningSummarize || isRunningEmbed
  const parseDone = !paper.parse_status || paper.parse_status === 'completed' || paper.parse_status === 'done'
  const summaryDone = !paper.summary_status || paper.summary_status === 'completed' || paper.summary_status === 'done'
  const embedDone = !paper.embedding_status || paper.embedding_status === 'completed' || paper.embedding_status === 'done' || paper.embedding_status === 'unavailable'

  return (
    <section className="paper-metadata-panel" aria-label="论文详情">
      {/* Header: always visible */}
      <div className="paper-detail-header">
        <h2 className="paper-detail-title">{paper.title}</h2>
        <div className="paper-detail-meta">
          <span>{paper.source}</span>
          {primaryCategoryName && <span> · {primaryCategoryName}</span>}
          <span> · {readingStatusLabel(paper.reading_status ?? 'unread')}</span>
        </div>

        <div className="paper-detail-status-row">
          <StatusBadge value={paper.status} />
          {paper.parse_status && <StatusBadge value={paper.parse_status} />}
          {paper.summary_status && <StatusBadge value={paper.summary_status} />}
          {paper.embedding_status && <StatusBadge value={paper.embedding_status} />}
        </div>

        <div className="paper-detail-actions">
          <button
            aria-label="打开阅读器"
            className="btn btn-primary"
            onClick={() => onOpenReader?.(paper)}
            type="button"
          >
            <Icon name="book" />
            打开阅读器
          </button>
          <button
            aria-label={paper.favorite ? '取消收藏' : '收藏论文'}
            aria-pressed={paper.favorite ?? false}
            className="btn btn-secondary"
            onClick={() => void onFavoriteChange?.(!(paper.favorite ?? false))}
            type="button"
          >
            <Icon name="spark" />
            {paper.favorite ? '已收藏' : '收藏'}
          </button>
        </div>

        <div className="paper-detail-process">
          <div className="model-selector-group">
            <select
              className="model-select"
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={isRunningSummarize}
              aria-label="选择模型"
            >
              {modelOptions.map((model) => (
                <option key={model.value || 'system-default'} value={model.value}>{model.label}</option>
              ))}
              {selectedModel && !modelOptions.some((model) => model.value === selectedModel) ? (
                <option value={selectedModel}>{selectedModel}</option>
              ) : null}
            </select>
          </div>
          <button
            aria-label="解析"
            className="btn btn-action"
            disabled={isRunningParse}
            onClick={() => void onParse()}
            type="button"
          >
            {isRunningParse ? <><span className="spinner" />解析中...</> : <><Icon name="fileText" />解析</>}
          </button>
          <button
            aria-label="生成摘要"
            className="btn btn-action"
            disabled={isRunningSummarize}
            onClick={() => void onSummarize()}
            type="button"
          >
            {isRunningSummarize ? <><span className="spinner" />生成中...</> : <><Icon name="spark" />生成摘要</>}
          </button>
          <button
            aria-label="向量化"
            className="btn btn-action"
            disabled={isRunningEmbed}
            onClick={() => void onEmbed()}
            type="button"
            title="生成用于语义检索的向量"
          >
            {isRunningEmbed ? <><span className="spinner" />生成中...</> : <><Icon name="vector" />向量化</>}
          </button>
          <button
            aria-label="刷新论文数据"
            className="btn btn-action"
            disabled={isBusy}
            onClick={() => void onRefreshDetail()}
            type="button"
            title="刷新当前论文数据"
          >
            <Icon name="refresh" />
            刷新
          </button>
        </div>
      </div>

      {/* 摘要 section */}
      <details className="paper-section" open>
        <summary>摘要</summary>
        <div className="paper-section-body">
          {paper.abstract_raw || paper.abstract_md ? (
            <p className="paper-abstract-text">{paper.abstract_md || paper.abstract_raw}</p>
          ) : (
            <div className="paper-section-empty">
              <span>暂无摘要内容。</span>
              <button
                className="btn btn-action"
                disabled={isRunningSummarize}
                onClick={() => void onSummarize()}
                type="button"
              >
                {isRunningSummarize ? <><span className="spinner" />生成中...</> : '生成摘要'}
              </button>
            </div>
          )}
        </div>
      </details>

      {/* 处理流程 section */}
      <details className="paper-section" open>
        <summary>处理流程</summary>
        <div className="paper-section-body">
          <div className="pipeline-flow">
            <span className={`pipeline-step ${paper.status !== 'parse_failed' ? 'done' : 'failed'}`}>
              导入{paper.status !== 'parse_failed' ? ' ✓' : ' ✗'}
            </span>
            <span className="pipeline-arrow">→</span>
            <span className={`pipeline-step ${parseDone ? 'done' : 'pending'}`}>
              解析{parseDone ? ' ✓' : ''}
            </span>
            <span className="pipeline-arrow">→</span>
            <span className={`pipeline-step ${summaryDone ? 'done' : 'pending'}`}>
              摘要{summaryDone ? ' ✓' : ''}
            </span>
            <span className="pipeline-arrow">→</span>
            <span className={`pipeline-step ${embedDone ? 'done' : 'pending'}`}>
              向量{embedDone ? ' ✓' : ''}
            </span>
          </div>
        </div>
      </details>

      {/* 基础信息 section (collapsed by default) */}
      <details className="paper-section">
        <summary>
          基础信息
          <span className="paper-section-hint">编辑元数据</span>
        </summary>
        <div className="paper-section-body">
          <form className="paper-metadata-edit" onSubmit={saveMetadata}>
            {metadataFields.map(({ field, label, inputMode }) => (
              <label className="library-control" htmlFor={`paper-metadata-${field}`} key={field}>
                <span>{label}</span>
                <input
                  id={`paper-metadata-${field}`}
                  inputMode={inputMode}
                  onChange={(event) => updateMetadata(field, event.target.value)}
                  value={metadata[field]}
                />
              </label>
            ))}
            <button className="btn btn-secondary metadata-wide-field" type="submit">保存元数据</button>
          </form>
        </div>
      </details>

      {/* 期刊/会议等级 section */}
      <details className="paper-section">
        <summary>
          期刊/会议等级
          <span className="paper-section-hint">仅供参考 · 可手动纠正</span>
        </summary>
        <div className="paper-section-body">
          <div className="paper-rank-display">
            <div className="paper-rank-row">
              <span className="paper-rank-label">出处</span>
              <span className="paper-rank-value">{paper.venue?.trim() || '未填写'}</span>
            </div>
            <div className="paper-rank-row">
              <span className="paper-rank-label">等级</span>
              {(rank.ccf || rank.sciZone || rank.impactFactor) ? (
                <RankBadge ccf={rank.ccf} sciZone={rank.sciZone} impactFactor={rank.impactFactor} />
              ) : (
                <span className="paper-rank-empty">暂无等级信息（可在下方手动填写）</span>
              )}
            </div>
            {(rank.ccf || rank.sciZone || rank.impactFactor) && (
              <div className="paper-rank-sources">
                {rank.ccf && (
                  <span className="paper-rank-source">CCF · {paper.ccf_rank_override?.trim() ? '手动' : '系统匹配'}</span>
                )}
                {rank.sciZone && (
                  <span className="paper-rank-source">SCI · {paper.sci_zone_override?.trim() ? '手动' : '系统匹配'}</span>
                )}
                {rank.impactFactor && (
                  <span className="paper-rank-source">IF · {paper.impact_factor_override?.trim() ? '手动' : '系统匹配'}</span>
                )}
              </div>
            )}
          </div>

          <form className="paper-rank-edit" onSubmit={saveRankOverrides}>
            <label className="library-control" htmlFor="paper-rank-ccf">
              <span>CCF 等级</span>
              <input
                id="paper-rank-ccf"
                list="ccf-rank-options"
                onChange={(event) => setRankOverrides((cur) => ({ ...cur, ccf: event.target.value }))}
                placeholder="A / B / C"
                value={rankOverrides.ccf}
              />
            </label>
            <datalist id="ccf-rank-options">
              <option value="A" />
              <option value="B" />
              <option value="C" />
            </datalist>
            <label className="library-control" htmlFor="paper-rank-sci">
              <span>SCI 分区</span>
              <input
                id="paper-rank-sci"
                list="sci-zone-options"
                onChange={(event) => setRankOverrides((cur) => ({ ...cur, sciZone: event.target.value }))}
                placeholder="1区 / 2区 / 3区 / 4区"
                value={rankOverrides.sciZone}
              />
            </label>
            <datalist id="sci-zone-options">
              <option value="1区" />
              <option value="2区" />
              <option value="3区" />
              <option value="4区" />
            </datalist>
            <label className="library-control" htmlFor="paper-rank-if">
              <span>影响因子</span>
              <input
                id="paper-rank-if"
                inputMode="decimal"
                onChange={(event) => setRankOverrides((cur) => ({ ...cur, impactFactor: event.target.value }))}
                placeholder="如 12.3"
                value={rankOverrides.impactFactor}
              />
            </label>
            <p className="paper-rank-hint">留空使用系统匹配值；填入则覆盖系统值。清空并保存可恢复系统匹配。</p>
            <button className="btn btn-secondary metadata-wide-field" type="submit">保存等级纠正</button>
          </form>
        </div>
      </details>

      {/* 分类与匹配 section */}
      <details className="paper-section">
        <summary>分类与匹配</summary>
        <div className="paper-section-body">
          {categories.length > 0 && (
            <label className="library-control" htmlFor="paper-metadata-category">
              <span>主分类</span>
              <select
                disabled={isUpdatingCategory}
                id="paper-metadata-category"
                onChange={(event) => {
                  const categoryId = Number(event.target.value)
                  if (!Number.isNaN(categoryId)) {
                    void onCategoryChange(categoryId)
                  }
                }}
                value={paper.primary_category_id ?? ''}
              >
                <option value="" disabled>
                  选择分类
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="paper-category-meta">
            <StatusBadge value={paper.category_status ?? 'unclassified'} />
            {paper.category_confidence !== undefined && (
              <span>{Math.round(paper.category_confidence * 100)}% 置信度</span>
            )}
          </div>

          {paper.category_reason && (
            <p className="paper-category-reason">{paper.category_reason}</p>
          )}
        </div>
      </details>

      {/* 阅读管理 section */}
      <details className="paper-section">
        <summary>阅读管理</summary>
        <div className="paper-section-body">
          <form className="paper-reading-edit" onSubmit={saveReadingState}>
            <label className="library-control" htmlFor="paper-reading-status">
              <span>阅读状态</span>
              <select id="paper-reading-status" onChange={(event) => setReadingStatus(event.target.value as ReadingStatus)} value={readingStatus}>
                {readingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="library-control" htmlFor="paper-reading-progress">
              <span>阅读进度</span>
              <input id="paper-reading-progress" max="100" min="0" onChange={(event) => setReadingProgress(event.target.value)} type="number" value={readingProgress} />
            </label>
            <button className="btn btn-secondary" type="submit">保存阅读状态</button>
          </form>

          <form className="paper-notes-edit" onSubmit={saveNotes}>
            <label className="library-control" htmlFor="paper-user-notes">
              <span>用户笔记</span>
              <textarea id="paper-user-notes" onChange={(event) => setNotes(event.target.value)} value={notes} />
            </label>
            {notesError && <p className="form-error">{notesError}</p>}
            <button className="btn btn-secondary" type="submit">保存笔记</button>
          </form>
        </div>
      </details>

      <PaperTagEditor key={paper.id} onTagsChange={onTagsChange} tags={paper.tags ?? []} />
    </section>
  )
}
