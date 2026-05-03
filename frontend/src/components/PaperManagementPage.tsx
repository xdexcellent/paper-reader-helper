import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  createCategory,
  deletePaper,
  embedPaper,
  fetchPaperDetail,
  parsePaper,
  summarizePaper,
  updatePaperCategory,
  uploadPaper,
  waitForTaskCompletion,
} from '../lib/api'
import type { Category, CategoryScope, Paper, PaperDetail as PaperDetailType } from '../types'
import { FeedbackBanner } from './FeedbackBanner'
import { ImportForm } from './ImportForm'
import { PaperActions } from './PaperActions'
import { PaperDetail } from './PaperDetail'
import { PaperList } from './PaperList'

type BulkActionFailure = {
  paper: Paper
  message: string
}

async function runBulkPaperAction(
  papers: Paper[],
  action: (paper: Paper) => Promise<unknown>,
): Promise<{ succeeded: Paper[]; failed: BulkActionFailure[] }> {
  const results = await Promise.allSettled(papers.map((paper) => action(paper)))
  const succeeded: Paper[] = []
  const failed: BulkActionFailure[] = []

  results.forEach((result, index) => {
    const paper = papers[index]
    if (result.status === 'fulfilled') {
      succeeded.push(paper)
      return
    }
    failed.push({
      paper,
      message: result.reason instanceof Error ? result.reason.message : '请求失败，请稍后重试',
    })
  })

  return { succeeded, failed }
}

function formatBulkActionError(prefix: string, failed: BulkActionFailure[]): string {
  if (failed.length === 0) return ''
  const sample = failed
    .slice(0, 2)
    .map(({ paper, message }) => `${paper.title}：${message}`)
    .join('；')
  return `${prefix}失败 ${failed.length} 篇${sample ? `，${sample}` : ''}`
}

function filterCategoriesByScope(categories: Category[], scope: CategoryScope): Category[] {
  if (scope === 'system') return categories.filter(category => category.is_system)
  if (scope === 'custom') return categories.filter(category => !category.is_system)
  if (scope === 'pending') return categories.filter(category => category.is_pending_bucket)
  return categories
}

export function PaperManagementPage({
  papers,
  categories,
  isLoadingLibrary,
  refreshLibrary,
}: {
  papers: Paper[]
  categories: Category[]
  isLoadingLibrary: boolean
  refreshLibrary: () => Promise<void>
}) {
  const { paperId: paramPaperId } = useParams()
  const navigate = useNavigate()

  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(paramPaperId ? Number(paramPaperId) : null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PaperDetailType | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSubmittingImport, setIsSubmittingImport] = useState(false)
  const [isRunningParse, setIsRunningParse] = useState(false)
  const [isRunningSummarize, setIsRunningSummarize] = useState(false)
  const [isRunningEmbed, setIsRunningEmbed] = useState(false)
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false)
  const [isRetryingParseFailed, setIsRetryingParseFailed] = useState(false)
  const [isDeletingParseFailed, setIsDeletingParseFailed] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false)
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')
  const [hasAutoOpenedImport, setHasAutoOpenedImport] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState('gpt-5.4')
  const [categoryScope, setCategoryScope] = useState<CategoryScope>('all')
  const latestDetailRequestRef = useRef(0)
  const suppressedRoutePaperIdRef = useRef<number | null>(null)

  function clearSelectedPaper(targetPaperId: number | null) {
    if (targetPaperId !== null) {
      suppressedRoutePaperIdRef.current = targetPaperId
    }
    setSelectedPaperId(null)
    setDetail(null)
    navigate('/', { replace: true })
  }

  const visibleCategories = useMemo(
    () => filterCategoriesByScope(categories, categoryScope),
    [categories, categoryScope],
  )
  const parseFailedPapers = useMemo(
    () => papers.filter((paper) => paper.status === 'parse_failed'),
    [papers],
  )
  const selectedCategory = useMemo(
    () => categories.find(category => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  )
  const visiblePapers = useMemo(
    () => papers.filter(paper => selectedCategoryId === null || paper.primary_category_id === selectedCategoryId),
    [papers, selectedCategoryId],
  )
  const isParseInProgress = isRunningParse || detail?.parse_status === 'processing' || detail?.status === 'parsing'
  const isSummarizeInProgress =
    isRunningSummarize || detail?.summary_status === 'processing' || detail?.status === 'summarizing'
  const isEmbedInProgress = isRunningEmbed || detail?.embedding_status === 'processing'
  const shouldPollDetail =
    detail != null
    && (
      detail.parse_status === 'processing'
      || detail.summary_status === 'processing'
      || detail.embedding_status === 'processing'
      || detail.status === 'parsing'
      || detail.status === 'summarizing'
    )

  useEffect(() => {
    if (selectedCategoryId === null) return
    if (visibleCategories.some(category => category.id === selectedCategoryId)) return
    setSelectedCategoryId(null)
  }, [visibleCategories, selectedCategoryId])

  useEffect(() => {
    if (selectedPaperId === null) return
    if (visiblePapers.some(paper => paper.id === selectedPaperId)) return
    clearSelectedPaper(selectedPaperId)
  }, [visiblePapers, selectedPaperId, navigate])

  async function loadPaperDetail(
    paperId: number,
    options: { resetDetail?: boolean; showLoading?: boolean } = {},
  ) {
    const { resetDetail = true, showLoading = true } = options
    setSelectedPaperId(paperId)
    if (resetDetail) {
      setDetail(null)
    }
    if (showLoading) {
      setIsLoadingDetail(true)
    }
    const requestId = latestDetailRequestRef.current + 1
    latestDetailRequestRef.current = requestId

    try {
      const nextDetail = await fetchPaperDetail(paperId)
      if (latestDetailRequestRef.current !== requestId) return
      if (nextDetail == null) return
      setDetail(nextDetail)
    } finally {
      if (showLoading && latestDetailRequestRef.current === requestId) {
        setIsLoadingDetail(false)
      }
    }
  }

  useEffect(() => {
    if (!paramPaperId) {
      suppressedRoutePaperIdRef.current = null
      return
    }
    const id = Number(paramPaperId)
    if (suppressedRoutePaperIdRef.current === id && selectedPaperId === null) return
    if (id && (id !== selectedPaperId || (detail?.id !== id && !isLoadingDetail))) {
      loadPaperDetail(id).catch(() => {})
    }
  }, [paramPaperId, selectedPaperId, detail?.id, isLoadingDetail])

  useEffect(() => {
    if (!shouldPollDetail || detail === null) return

    const timerId = window.setInterval(() => {
      void loadPaperDetail(detail.id, { resetDetail: false, showLoading: false })
      void refreshLibrary().catch(() => {})
    }, 2000)

    return () => window.clearInterval(timerId)
  }, [detail, refreshLibrary, shouldPollDetail])

  useEffect(() => {
    if (hasAutoOpenedImport || isLoadingLibrary || papers.length > 0) return
    setIsImportOpen(true)
    setHasAutoOpenedImport(true)
  }, [hasAutoOpenedImport, isLoadingLibrary, papers.length])

  async function handleSelect(paper: Paper) {
    setErrorMessage('')
    setFeedbackMessage('')
    navigate(`/paper/${paper.id}`)
    try {
      await loadPaperDetail(paper.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '加载论文详情失败')
    }
  }

  async function handleDelete(paper: Paper) {
    setErrorMessage('')
    setFeedbackMessage('')
    try {
      await deletePaper(paper.id)
      if (selectedPaperId === paper.id) {
        clearSelectedPaper(paper.id)
      }
      await refreshLibrary()
      setFeedbackMessage('论文已删除')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '删除论文失败')
    }
  }

  async function handleImport(payload: { source: string; file: File }): Promise<boolean> {
    setIsSubmittingImport(true)
    setErrorMessage('')
    setFeedbackMessage('')
    try {
      const createdPaper = await uploadPaper(payload)
      await refreshLibrary()
      setIsImportOpen(false)
      navigate(`/paper/${createdPaper.id}`)
      await loadPaperDetail(createdPaper.id)
      setFeedbackMessage('导入成功')
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导入论文失败')
      return false
    } finally {
      setIsSubmittingImport(false)
    }
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newCategoryName.trim()) {
      setErrorMessage('请输入分类名称')
      return
    }

    setIsSubmittingCategory(true)
    setErrorMessage('')
    try {
      await createCategory({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim(),
      })
      await refreshLibrary()
      setFeedbackMessage('分类目录已创建')
      setNewCategoryName('')
      setNewCategoryDescription('')
      setIsCreateCategoryOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '创建分类失败')
    } finally {
      setIsSubmittingCategory(false)
    }
  }

  async function handlePrimaryCategoryChange(categoryId: number) {
    if (!detail || detail.primary_category_id === categoryId) return
    const nextPaperId = detail.id
    const activeCategoryId = selectedCategoryId
    setIsUpdatingCategory(true)
    setErrorMessage('')
    try {
      const updatedPaper = await updatePaperCategory(nextPaperId, categoryId)
      await refreshLibrary()
      const staysVisible = activeCategoryId === null || updatedPaper.primary_category_id === activeCategoryId
      if (!staysVisible) {
        clearSelectedPaper(nextPaperId)
        setFeedbackMessage('主分类已更新，论文已移出当前目录')
        return
      }
      await loadPaperDetail(nextPaperId)
      setFeedbackMessage('主分类已更新')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '更新主分类失败')
    } finally {
      setIsUpdatingCategory(false)
    }
  }

  async function handleRefresh() {
    if (detail === null) return
    setErrorMessage('')
    try {
      await loadPaperDetail(detail.id)
      await refreshLibrary()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '刷新论文失败')
    }
  }

  async function handleParse() {
    if (detail === null) return
    setIsRunningParse(true)
    setErrorMessage('')
    setFeedbackMessage('解析任务已提交，正在等待完成...')
    try {
      const result = await parsePaper(detail.id)
      const taskId = result.task_id as string | undefined
      if (taskId) {
        await waitForTaskCompletion(taskId)
      }
      await refreshLibrary()
      await loadPaperDetail(detail.id)
      setFeedbackMessage('论文解析完成')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '解析论文失败')
      setFeedbackMessage('')
    } finally {
      setIsRunningParse(false)
    }
  }

  async function handleSummarize() {
    if (detail === null) return
    setIsRunningSummarize(true)
    setErrorMessage('')
    setFeedbackMessage('摘要与分类任务已提交，正在等待完成...')
    try {
      const result = await summarizePaper(detail.id, selectedModel)
      const taskId = result.task_id as string | undefined
      if (taskId) {
        await waitForTaskCompletion(taskId)
      }
      await refreshLibrary()
      await loadPaperDetail(detail.id)
      setFeedbackMessage('AI 摘要与自动分类已更新')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '生成摘要失败')
      setFeedbackMessage('')
    } finally {
      setIsRunningSummarize(false)
    }
  }

  async function handleEmbed() {
    if (detail === null) return
    setIsRunningEmbed(true)
    setErrorMessage('')
    setFeedbackMessage('向量化任务已提交，正在等待完成...')
    try {
      const result = await embedPaper(detail.id)
      if (result.task_id) {
        await waitForTaskCompletion(result.task_id)
      }
      await refreshLibrary()
      await loadPaperDetail(detail.id)
      setFeedbackMessage('向量化完成')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '向量化失败')
      setFeedbackMessage('')
    } finally {
      setIsRunningEmbed(false)
    }
  }

  async function handleRetryAllParseFailed() {
    if (parseFailedPapers.length === 0) return

    setIsRetryingParseFailed(true)
    setErrorMessage('')
    setFeedbackMessage('正在批量提交失败论文的重新解析任务...')

    try {
      const { succeeded, failed } = await runBulkPaperAction(parseFailedPapers, (paper) => parsePaper(paper.id))
      await refreshLibrary()

      if (selectedPaperId !== null && succeeded.some((paper) => paper.id === selectedPaperId)) {
        await loadPaperDetail(selectedPaperId)
      }

      setFeedbackMessage(
        succeeded.length > 0
          ? `已提交 ${succeeded.length} 篇失败论文的重新解析任务`
          : '',
      )
      setErrorMessage(formatBulkActionError('重新解析', failed))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '批量重新解析失败')
      setFeedbackMessage('')
    } finally {
      setIsRetryingParseFailed(false)
    }
  }

  async function handleDeleteAllParseFailed() {
    if (parseFailedPapers.length === 0) return
    if (!window.confirm(`确定删除全部 ${parseFailedPapers.length} 篇解析失败论文吗？`)) return

    setIsDeletingParseFailed(true)
    setErrorMessage('')
    setFeedbackMessage('正在删除解析失败论文...')

    try {
      const { succeeded, failed } = await runBulkPaperAction(parseFailedPapers, (paper) => deletePaper(paper.id))

      if (selectedPaperId !== null && succeeded.some((paper) => paper.id === selectedPaperId)) {
        clearSelectedPaper(selectedPaperId)
      }

      await refreshLibrary()
      setFeedbackMessage(
        succeeded.length > 0
          ? `已删除 ${succeeded.length} 篇解析失败论文`
          : '',
      )
      setErrorMessage(formatBulkActionError('删除', failed))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '批量删除失败')
      setFeedbackMessage('')
    } finally {
      setIsDeletingParseFailed(false)
    }
  }

  const pageTitle = '论文管理'
  const pageSubtitle = '受控分类目录管理主分类，多标签继续保留为辅助语义。'
  const totalPending = papers.filter(paper => paper.category_status === 'pending_review').length
  const parseFailedCount = parseFailedPapers.length
  const categoryPaperCount = selectedCategory ? selectedCategory.paper_count : visiblePapers.length
  const categoryPendingCount = selectedCategory ? selectedCategory.pending_count : totalPending

  return (
    <>
      <header className="workspace-header">
        <div className="workspace-title-block">
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
          <span className="panel-chip legacy-workspace-chip">论文工作台</span>
        </div>
        <div className="workspace-header-right">
          {isLoadingLibrary && (
            <span className="sync-indicator">
              <span className="spinner" />
              同步中
            </span>
          )}
          <span className="online-indicator">在线运行</span>
        </div>
      </header>

      <div className="paper-management-shell">
        <aside className="glass-card category-rail">
          <div className="category-rail-header">
            <div>
              <h2>分类目录</h2>
              <p>主分类决定目录结构，标签继续做交叉描述。</p>
            </div>
          </div>

          <div className="category-scope-row">
            <label htmlFor="category-scope">目录范围</label>
            <select
              id="category-scope"
              aria-label="目录范围"
              className="paper-search-input"
              value={categoryScope}
              onChange={(event) => setCategoryScope(event.target.value as CategoryScope)}
            >
              <option value="all">全部目录</option>
              <option value="system">系统分类</option>
              <option value="custom">自定义分类</option>
              <option value="pending">待确认</option>
            </select>
          </div>

          <div className="category-list">
            <button
              type="button"
              className={`category-item${selectedCategoryId === null ? ' active' : ''}`}
              onClick={() => setSelectedCategoryId(null)}
            >
              <span>全部论文 ({papers.length})</span>
            </button>
            {visibleCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`category-item${selectedCategoryId === category.id ? ' active' : ''}${category.is_pending_bucket ? ' pending' : ''}`}
                onClick={() => setSelectedCategoryId(category.id)}
              >
                <span>{category.name} ({category.paper_count})</span>
                {category.pending_count > 0 && (
                  <small>{category.pending_count} 待确认</small>
                )}
              </button>
            ))}
          </div>
        </aside>

        <main className="management-main">
          <section className="glass-card management-toolbar">
            <div className="management-toolbar-actions">
              <button type="button" className="btn btn-primary" onClick={() => setIsImportOpen(true)}>
                导入论文
              </button>
              <button
                type="button"
                className="btn btn-action"
                onClick={() => setIsCreateCategoryOpen((value) => !value)}
              >
                新建分类
              </button>
            </div>
            {parseFailedCount > 0 && (
              <div className="parse-failed-manager" role="status" aria-live="polite">
                <div className="parse-failed-manager-summary">
                  <span className="parse-failed-manager-label">解析失败 {parseFailedCount} 篇</span>
                  <small>支持统一重试解析，或一键清理失败记录。</small>
                </div>
                <div className="parse-failed-manager-actions">
                  <button
                    type="button"
                    className="btn btn-action"
                    onClick={handleRetryAllParseFailed}
                    disabled={isRetryingParseFailed || isDeletingParseFailed}
                  >
                    {isRetryingParseFailed ? '重试提交中...' : '全部重试解析'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-action parse-failed-delete-btn"
                    onClick={handleDeleteAllParseFailed}
                    disabled={isDeletingParseFailed || isRetryingParseFailed}
                  >
                    {isDeletingParseFailed ? '删除中...' : '全部删除失败论文'}
                  </button>
                </div>
              </div>
            )}
            <div className="management-toolbar-note">
              <span>待确认 {totalPending}</span>
            </div>
          </section>

          {isCreateCategoryOpen && (
            <form className="glass-card category-create-form" onSubmit={handleCreateCategory}>
              <div className="category-create-grid">
                <label className="form-group">
                  <span>分类名称</span>
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="例如：科学计算"
                  />
                </label>
                <label className="form-group">
                  <span>分类说明</span>
                  <input
                    value={newCategoryDescription}
                    onChange={(event) => setNewCategoryDescription(event.target.value)}
                    placeholder="这个目录主要收什么论文"
                  />
                </label>
              </div>
              <div className="category-create-actions">
                <button type="submit" className="btn btn-primary" disabled={isSubmittingCategory}>
                  {isSubmittingCategory ? '创建中...' : '保存分类'}
                </button>
              </div>
            </form>
          )}

          <section className="glass-card category-summary">
            <div className="panel-header">
              <div>
                <h2>{selectedCategory?.name ?? '全部论文'}</h2>
                <p>{selectedCategory?.description || '先按主分类目录浏览，再用标签做细粒度筛选。'}</p>
              </div>
            </div>
            <div className="category-stat-grid">
              <div className="category-stat-card">
                <span>论文数</span>
                <strong>{categoryPaperCount}</strong>
              </div>
              <div className="category-stat-card">
                <span>待确认</span>
                <strong>{categoryPendingCount}</strong>
              </div>
              <div className="category-stat-card">
                <span>辅助标签</span>
                <strong>{new Set(visiblePapers.flatMap(paper => paper.tags ?? [])).size}</strong>
              </div>
            </div>
          </section>

          <div className="paper-management-grid">
            <section className="reading-list-panel glass-card management-list-panel">
              <PaperList
                papers={visiblePapers}
                selectedPaperId={selectedPaperId}
                isLoading={isLoadingLibrary}
                onSelect={handleSelect}
                onDelete={handleDelete}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </section>

            <section className="reading-detail-panel">
              <PaperActions
                disabled={detail === null || isLoadingDetail}
                isRunningParse={isParseInProgress}
                isRunningSummarize={isSummarizeInProgress}
                isRunningEmbed={isEmbedInProgress}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                onParse={handleParse}
                onSummarize={handleSummarize}
                onEmbed={handleEmbed}
                onRefresh={handleRefresh}
              />
              <FeedbackBanner feedbackMessage={feedbackMessage} errorMessage={errorMessage} />
              <PaperDetail
                paper={detail}
                isLoading={isLoadingDetail}
                categories={categories}
                onCategoryChange={handlePrimaryCategoryChange}
                isUpdatingCategory={isUpdatingCategory}
              />
            </section>
          </div>
        </main>
      </div>

      {isImportOpen && (
        <div className="modal-overlay" onClick={() => setIsImportOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <ImportForm onSubmit={handleImport} isSubmitting={isSubmittingImport} />
          </div>
        </div>
      )}
    </>
  )
}
