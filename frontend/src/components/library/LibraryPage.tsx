import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { createCategory, deletePaper, embedPaper, fetchPaperDetail, parsePaper, summarizePaper, updatePaperCategory, updatePaperTags, uploadPaper, waitForTaskCompletion } from '../../lib/api'
import { SYSTEM_DEFAULT_MODEL_VALUE, useAiModelOptions } from '../../lib/aiModels'
import type { Category, Paper, PaperDetail } from '../../types'
import { runBulkPaperAction } from './libraryBulkActions'
import { createLibraryMetadataActions } from './libraryMetadataActions'
import { LibraryImportModal } from './LibraryImportModal'
import { LibraryPageHeader } from './LibraryPageHeader'
import { LibraryWorkspaceLayout } from './LibraryWorkspaceLayout'
import type { CategoryScope, FavoriteFilter, ImportConfirmPayload, LibraryStatusFilter, ReadingStatusFilter } from './libraryTypes'

type LibraryPageProps = {
  papers: Paper[]
  categories: Category[]
  isLoadingLibrary: boolean
  refreshLibrary: () => Promise<void>
}

export function LibraryPage({ papers, categories, isLoadingLibrary, refreshLibrary }: LibraryPageProps) {
  const { paperId } = useParams()
  const navigate = useNavigate()
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(paperId ? Number(paperId) : null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PaperDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSubmittingImport, setIsSubmittingImport] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')
  const [categoryScope, setCategoryScope] = useState<CategoryScope>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>('all')
  const [favoriteFilter, setFavoriteFilter] = useState<FavoriteFilter>('all')
  const [readingStatusFilter, setReadingStatusFilter] = useState<ReadingStatusFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(SYSTEM_DEFAULT_MODEL_VALUE)
  const { modelOptions } = useAiModelOptions(selectedModel, setSelectedModel)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isRunningParse, setIsRunningParse] = useState(false)
  const [isRunningSummarize, setIsRunningSummarize] = useState(false)
  const [isRunningEmbed, setIsRunningEmbed] = useState(false)
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false)
  const [isRetryingParseFailed, setIsRetryingParseFailed] = useState(false)
  const [isDeletingParseFailed, setIsDeletingParseFailed] = useState(false)
  const requestRef = useRef(0)
  const requestedPaperIdRef = useRef<number | null>(null)

  const parseFailedPapers = useMemo(
    () => papers.filter((paper) => paper.status === 'parse_failed' || paper.parse_status === 'failed'),
    [papers],
  )
  const categoryPapers = useMemo(
    () => papers.filter((paper) => selectedCategoryId === null || paper.primary_category_id === selectedCategoryId),
    [papers, selectedCategoryId],
  )
  const shouldPollDetail = detail != null
    && [detail.status, detail.parse_status, detail.summary_status, detail.embedding_status]
      .some((status) => ['parsing', 'summarizing', 'processing', 'running'].includes(status))

  function clearSelection() {
    setSelectedPaperId(null)
    setDetail(null)
    navigate('/', { replace: true })
  }

  async function loadPaperDetail(id: number, options: { reset?: boolean; loading?: boolean } = {}) {
    const { reset = true, loading = true } = options
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    requestedPaperIdRef.current = id
    setSelectedPaperId(id)
    if (reset) setDetail(null)
    if (loading) setIsLoadingDetail(true)
    try {
      const nextDetail = await fetchPaperDetail(id)
      if (requestRef.current === requestId) {
        setDetail(nextDetail)
      }
    } finally {
      if (loading && requestRef.current === requestId) {
        setIsLoadingDetail(false)
      }
    }
  }

  useEffect(() => {
    if (!paperId) return
    const nextPaperId = Number(paperId)
    if (Number.isNaN(nextPaperId)) return
    if (requestedPaperIdRef.current === nextPaperId) return
    if (detail?.id === nextPaperId || isLoadingDetail) return
    loadPaperDetail(nextPaperId).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : '加载论文详情失败')
      setIsLoadingDetail(false)
    })
  }, [paperId, detail?.id, isLoadingDetail])

  useEffect(() => {
    if (!shouldPollDetail || !detail) return
    const timerId = window.setInterval(() => {
      void loadPaperDetail(detail.id, { reset: false, loading: false })
      void refreshLibrary()
    }, 2000)
    return () => window.clearInterval(timerId)
  }, [detail?.id, refreshLibrary, shouldPollDetail])

  function handleSelect(paper: Paper) {
    setErrorMessage('')
    setFeedbackMessage('')
    requestedPaperIdRef.current = null
    setSelectedPaperId(paper.id)
    setDetail(null)
    navigate(`/paper/${paper.id}`)
  }

  async function handleImport(payload: ImportConfirmPayload): Promise<boolean> {
    setIsSubmittingImport(true)
    setErrorMessage('')
    try {
      const createdPaper = await uploadPaper(payload)
      await refreshLibrary()
      navigate(`/paper/${createdPaper.id}`)
      await loadPaperDetail(createdPaper.id)
      setFeedbackMessage('导入完成')
      setIsImportOpen(false)
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导入失败')
      return false
    } finally {
      setIsSubmittingImport(false)
    }
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newCategoryName.trim()) return
    await createCategory({ name: newCategoryName.trim(), description: newCategoryDescription.trim() })
    setNewCategoryName('')
    setNewCategoryDescription('')
    setIsCreateCategoryOpen(false)
    await refreshLibrary()
  }

  async function handlePrimaryCategoryChange(categoryId: number) {
    if (!detail || detail.primary_category_id === categoryId) return
    setIsUpdatingCategory(true)
    try {
      const updatedPaper = await updatePaperCategory(detail.id, categoryId)
      const staysVisible = selectedCategoryId === null || updatedPaper.primary_category_id === selectedCategoryId
      if (!staysVisible) {
        clearSelection(); await refreshLibrary(); setFeedbackMessage('主分类已更新；论文已从当前分类移出。'); return
      }
      await refreshLibrary()
      await loadPaperDetail(detail.id)
      setFeedbackMessage('主分类已更新')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '主分类更新失败')
    } finally {
      setIsUpdatingCategory(false)
    }
  }

  async function handleTagsChange(tags: string[]) {
    if (!detail) return
    await updatePaperTags(detail.id, tags)
    setDetail({ ...detail, tags })
    await refreshLibrary()
  }

  async function runPipelineAction(
    setRunning: (value: boolean) => void,
    action: (paperId: number) => Promise<Record<string, unknown>>,
    successMessage: string,
  ) {
    if (!detail) return
    setRunning(true)
    setErrorMessage('')
    try {
      const result = await action(detail.id)
      if (typeof result.task_id === 'string' && result.task_id) {
        await waitForTaskCompletion(result.task_id)
      }
      await refreshLibrary()
      await loadPaperDetail(detail.id)
      setFeedbackMessage(successMessage)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任务失败')
    } finally {
      setRunning(false)
    }
  }

  async function handleRetryAllParseFailed() {
    setIsRetryingParseFailed(true)
    const { succeeded, failed } = await runBulkPaperAction(parseFailedPapers, (paper) => parsePaper(paper.id))
    await refreshLibrary()
    setFeedbackMessage(`已提交 ${succeeded.length} 个重试解析任务`)
    setErrorMessage(failed.length > 0 ? `${failed.length} 个重试解析任务失败` : '')
    setIsRetryingParseFailed(false)
  }

  async function handleDeleteAllParseFailed() {
    if (!window.confirm(`确定要删除 ${parseFailedPapers.length} 篇解析失败的论文吗？`)) return
    setIsDeletingParseFailed(true)
    const { succeeded, failed } = await runBulkPaperAction(parseFailedPapers, (paper) => deletePaper(paper.id))
    if (selectedPaperId !== null && succeeded.some((paper) => paper.id === selectedPaperId)) clearSelection()
    await refreshLibrary()
    setFeedbackMessage(`已删除 ${succeeded.length} 篇解析失败的论文`)
    setErrorMessage(failed.length > 0 ? `${failed.length} 个删除操作失败` : '')
    setIsDeletingParseFailed(false)
  }

  const metadataActions = createLibraryMetadataActions({ detail, refreshLibrary, loadPaperDetail, setFeedbackMessage, setErrorMessage })

  return (
    <>
      <LibraryPageHeader />

      <LibraryWorkspaceLayout
        papers={papers}
        categoryPapers={categoryPapers}
        categories={categories}
        selectedPaperId={selectedPaperId}
        selectedCategoryId={selectedCategoryId}
        categoryScope={categoryScope}
        isLoadingLibrary={isLoadingLibrary}
        isCreateCategoryOpen={isCreateCategoryOpen}
        newCategoryName={newCategoryName}
        newCategoryDescription={newCategoryDescription}
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        favoriteFilter={favoriteFilter}
        readingStatusFilter={readingStatusFilter}
        activeTag={activeTag}
        detail={detail}
        isLoadingDetail={isLoadingDetail}
        isUpdatingCategory={isUpdatingCategory}
        feedbackMessage={feedbackMessage}
        errorMessage={errorMessage}
        isRunningParse={isRunningParse}
        isRunningSummarize={isRunningSummarize}
        isRunningEmbed={isRunningEmbed}
        selectedModel={selectedModel}
        modelOptions={modelOptions}
        isRetryingParseFailed={isRetryingParseFailed}
        isDeletingParseFailed={isDeletingParseFailed}
        onCategoryScopeChange={setCategoryScope}
        onSelectCategory={setSelectedCategoryId}
        onOpenImport={() => setIsImportOpen(true)}
        onToggleCreateCategory={() => setIsCreateCategoryOpen((value) => !value)}
        onRefreshLibrary={refreshLibrary}
        onRetryParseFailed={handleRetryAllParseFailed}
        onDeleteParseFailed={handleDeleteAllParseFailed}
        onNewCategoryNameChange={setNewCategoryName}
        onNewCategoryDescriptionChange={setNewCategoryDescription}
        onCreateCategory={handleCreateCategory}
        onSearchChange={setSearchQuery}
        onStatusFilterChange={setStatusFilter}
        onFavoriteFilterChange={setFavoriteFilter}
        onReadingStatusFilterChange={setReadingStatusFilter}
        onTagChange={setActiveTag}
        onSelectPaper={handleSelect}
        onDeletePaper={async (paper) => {
          await deletePaper(paper.id)
          if (selectedPaperId === paper.id) clearSelection()
          await refreshLibrary()
        }}
        onModelChange={setSelectedModel}
        onParse={() => runPipelineAction(setIsRunningParse, parsePaper, '解析完成')}
        onSummarize={() => runPipelineAction(setIsRunningSummarize, (id) => summarizePaper(id, selectedModel), '摘要完成')}
        onEmbed={() => runPipelineAction(setIsRunningEmbed, embedPaper, '向量化完成')}
        onRefreshDetail={() => detail ? loadPaperDetail(detail.id) : Promise.resolve()}
        onCategoryChange={handlePrimaryCategoryChange}
        onTagsChange={handleTagsChange}
        onOpenReader={(paper) => navigate(`/paper/${paper.id}/reader`)}
        onMetadataSave={metadataActions.handleMetadataSave}
        onFavoriteChange={metadataActions.handleFavoriteChange}
        onReadingStateChange={metadataActions.handleReadingStateChange}
        onNotesSave={metadataActions.handleNotesSave}
      />

      <LibraryImportModal
        papers={papers}
        isSubmitting={isSubmittingImport}
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSubmit={handleImport}
      />
    </>
  )
}
