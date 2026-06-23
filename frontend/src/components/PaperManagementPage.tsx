import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileText, AlertTriangle, Pencil, CheckCircle2, Star, type LucideIcon } from 'lucide-react'

import {
  autoClassifyPendingPapers,
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
import { paginateArray, computeTotalPages } from '../utils/pagination'
import { EmbeddingUnavailableNotice } from './EmbeddingNotice'
import { FeedbackBanner } from './FeedbackBanner'
import { ImportForm } from './ImportForm'
import { PaginationControl } from './PaginationControl'
import { PaperActions } from './PaperActions'
import { PaperDetail } from './PaperDetail'
import { PaperList } from './PaperList'
import { SYSTEM_DEFAULT_MODEL_VALUE, useAiModelOptions } from '../lib/aiModels'

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

export interface CategoryGroup {
  name: string
  paperCount: number
  pendingCount: number
  categoryIds: number[]
  isSystem: boolean
  isPendingBucket: boolean
}

/**
 * Priority order for category display.
 * Categories matching these names appear first, in this order.
 * Categories not in this list appear after, sorted alphabetically.
 */
const CATEGORY_PRIORITY_ORDER: string[] = [
  '待确认',
  '大语言模型',
  '强化学习',
  '扩散与生成',
  '多模态',
  '计算机视觉',
  '时间序列',
  '科学推理',
  '系统与边缘',
  'Cache加速',
  '数学理论',
  '模型安全',
  '联邦学习',
  '其他',
]

/** Normalize a category name for deduplication: trim, collapse whitespace, normalize unicode */
function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC')
}

export function dedupeCategories(categories: Category[]): CategoryGroup[] {
  const groupMap = new Map<string, CategoryGroup>()
  const order: string[] = []

  for (const cat of categories) {
    const key = normalizeCategoryName(cat.name)
    if (!key) continue // skip empty names
    if (groupMap.has(key)) {
      const group = groupMap.get(key)!
      group.paperCount += cat.paper_count
      group.pendingCount += cat.pending_count
      group.categoryIds.push(cat.id)
    } else {
      const group: CategoryGroup = {
        name: key,
        paperCount: cat.paper_count,
        pendingCount: cat.pending_count,
        categoryIds: [cat.id],
        isSystem: cat.is_system,
        isPendingBucket: cat.is_pending_bucket,
      }
      groupMap.set(key, group)
      order.push(key)
    }
  }

  const groups = order.map(key => groupMap.get(key)!)

  // Sort by priority order: prioritized categories first (in defined order), then the rest alphabetically
  groups.sort((a, b) => {
    const aIdx = CATEGORY_PRIORITY_ORDER.indexOf(a.name)
    const bIdx = CATEGORY_PRIORITY_ORDER.indexOf(b.name)
    // Both in priority list: sort by priority index
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    // Only a in priority list: a comes first
    if (aIdx !== -1) return -1
    // Only b in priority list: b comes first
    if (bIdx !== -1) return 1
    // Neither in priority list: sort alphabetically
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return groups
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
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedModel, setSelectedModel] = useState(SYSTEM_DEFAULT_MODEL_VALUE)
  const { modelOptions } = useAiModelOptions(selectedModel, setSelectedModel)
  const [categoryScope, setCategoryScope] = useState<CategoryScope>('all')
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false)
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [isClassifying, setIsClassifying] = useState(false)
  const latestDetailRequestRef = useRef(0)
  const suppressedRoutePaperIdRef = useRef<number | null>(null)

  const PAGE_SIZE = 10
  const CATEGORY_COLLAPSE_LIMIT = 12

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
  const dedupedCategories = useMemo(
    () => dedupeCategories(visibleCategories),
    [visibleCategories],
  )
  const visibleGroups = isCategoryExpanded
    ? dedupedCategories
    : dedupedCategories.slice(0, CATEGORY_COLLAPSE_LIMIT)
  const hiddenCount = dedupedCategories.length - CATEGORY_COLLAPSE_LIMIT
  const parseFailedPapers = useMemo(
    () => papers.filter((paper) => paper.status === 'parse_failed'),
    [papers],
  )
  const selectedCategory = useMemo(
    () => categories.find(category => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  )
  // Resolve the full set of category IDs for the selected group
  // When a group is selected (via its first ID), we look up the group and use ALL its categoryIds for filtering
  const selectedGroupIds = useMemo<number[] | null>(() => {
    if (selectedCategoryId === null) return null
    const group = dedupedCategories.find(g => g.categoryIds.includes(selectedCategoryId))
    return group ? group.categoryIds : [selectedCategoryId]
  }, [selectedCategoryId, dedupedCategories])

  const visiblePapers = useMemo(
    () => papers.filter(paper => selectedGroupIds === null || (paper.primary_category_id != null && selectedGroupIds.includes(paper.primary_category_id))),
    [papers, selectedGroupIds],
  )

  // Collect all unique tags from visible papers for the tag filter bar
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    visiblePapers.forEach(p => (p.tags ?? []).forEach(t => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [visiblePapers])

  // Apply search and tag filters to visible papers
  const filteredPapers = useMemo(() => {
    return visiblePapers.filter(p => {
      const matchSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
      const matchTag = !activeTag || (p.tags ?? []).includes(activeTag)
      return matchSearch && matchTag
    })
  }, [visiblePapers, searchQuery, activeTag])

  // Pagination
  const totalPages = computeTotalPages(filteredPapers.length, PAGE_SIZE)
  const paginatedPapers = useMemo(
    () => paginateArray(filteredPapers, currentPage, PAGE_SIZE),
    [filteredPapers, currentPage],
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

  // Reset pagination to page 1 when search query or tag filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, activeTag])

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

  async function handleBatchDelete(selectedPapers: Paper[]) {
    setErrorMessage('')
    setFeedbackMessage(`正在批量删除 ${selectedPapers.length} 篇论文...`)
    try {
      const { succeeded, failed } = await runBulkPaperAction(selectedPapers, (p) => deletePaper(p.id))
      if (selectedPaperId !== null && succeeded.some(p => p.id === selectedPaperId)) {
        clearSelectedPaper(selectedPaperId)
      }
      await refreshLibrary()
      setFeedbackMessage(succeeded.length > 0 ? `已删除 ${succeeded.length} 篇论文` : '')
      if (failed.length > 0) setErrorMessage(formatBulkActionError('删除', failed))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '批量删除失败')
      setFeedbackMessage('')
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
    const activeGroupIds = selectedGroupIds
    setIsUpdatingCategory(true)
    setErrorMessage('')
    try {
      const updatedPaper = await updatePaperCategory(nextPaperId, categoryId)
      await refreshLibrary()
      const staysVisible = activeGroupIds === null || (updatedPaper.primary_category_id != null && activeGroupIds.includes(updatedPaper.primary_category_id))
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
  const categoryPaperCount = selectedGroupIds !== null
    ? dedupedCategories.find(g => g.categoryIds.includes(selectedCategoryId!))?.paperCount ?? visiblePapers.length
    : visiblePapers.length
  const categoryPendingCount = selectedGroupIds !== null
    ? dedupedCategories.find(g => g.categoryIds.includes(selectedCategoryId!))?.pendingCount ?? totalPending
    : totalPending

  const kpiItems: { label: string; value: number; icon: LucideIcon; iconBg: string; color: string; trend: string; filter: (p: Paper) => boolean }[] = useMemo(() => [
    {
      label: '论文总数',
      value: papers.length,
      icon: FileText,
      iconBg: 'from-blue-50 to-sky-50',
      color: '#2563EB',
      trend: '全部已导入论文',
      filter: () => true,
    },
    {
      label: '待纠错确认',
      value: papers.filter(p => p.status === 'parse_failed' || p.parse_status === 'failed').length,
      icon: AlertTriangle,
      iconBg: 'from-amber-50 to-yellow-50',
      color: '#D97706',
      trend: '需要人工确认',
      filter: (p: Paper) => p.status === 'parse_failed' || p.parse_status === 'failed',
    },
    {
      label: '摘要待生成',
      value: papers.filter(p => !p.summary_status || p.summary_status === 'pending').length,
      icon: Pencil,
      iconBg: 'from-orange-50 to-amber-50',
      color: '#F97316',
      trend: '等待 AI 处理',
      filter: (p: Paper) => !p.summary_status || p.summary_status === 'pending',
    },
    {
      label: '向量化完成',
      value: papers.filter(p => p.embedding_status === 'done' || p.embedding_status === 'completed').length,
      icon: CheckCircle2,
      iconBg: 'from-emerald-50 to-teal-50',
      color: '#10B981',
      trend: '可用于语义搜索',
      filter: (p: Paper) => p.embedding_status === 'done' || p.embedding_status === 'completed',
    },
    {
      label: '已收藏',
      value: papers.filter(p => p.favorite).length,
      icon: Star,
      iconBg: 'from-red-50 to-rose-50',
      color: '#EF4444',
      trend: '个人收藏夹',
      filter: (p: Paper) => !!p.favorite,
    },
  ], [papers])

  const [kpiModalLabel, setKpiModalLabel] = useState<string | null>(null)
  const kpiModalPapers = useMemo(() => {
    if (!kpiModalLabel) return []
    const item = kpiItems.find(k => k.label === kpiModalLabel)
    return item ? papers.filter(item.filter) : []
  }, [kpiModalLabel, papers, kpiItems])

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
          <button type="button" className={`btn btn-batch-action${isBatchMode ? ' active' : ''}`} onClick={() => setIsBatchMode(prev => !prev)}>{isBatchMode ? '退出批量' : '批量操作'}</button>
          <span className="online-indicator">在线运行</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 px-8 mb-6 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
        {kpiItems.map(item => (
          <div
            className="relative flex items-center justify-between rounded-[18px] border border-[#E2E8F0] bg-white px-4 py-5 min-h-[88px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#BFDBFE] cursor-pointer"
            style={{ boxShadow: '0 8px 28px rgba(15,23,42,0.04)' }}
            key={item.label}
            onClick={() => setKpiModalLabel(item.label)}
          >
            <div className="flex flex-col">
              <span className="text-[30px] font-bold leading-none text-[#0F172A] tracking-tight">{item.value}</span>
              <span className="mt-1 text-[13px] font-medium text-[#334155]">{item.label}</span>
              <span className="mt-0.5 text-[11px] text-[#94A3B8]">{item.trend}</span>
            </div>
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${item.iconBg} ring-1 ring-inset ring-black/[0.03]`}
            >
              <item.icon size={20} style={{ color: item.color }} strokeWidth={1.8} />
            </div>
          </div>
        ))}
      </div>

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

          {totalPending > 0 && (
            <button
              type="button"
              className="category-auto-classify-btn"
              disabled={isClassifying}
              onClick={async () => {
                setIsClassifying(true)
                setFeedbackMessage('')
                try {
                  const result = await autoClassifyPendingPapers()
                  await refreshLibrary()
                  const parts: string[] = []
                  if (result.classified > 0) parts.push(`已分类 ${result.classified} 篇`)
                  if (result.created_categories.length > 0) parts.push(`新建: ${result.created_categories.join(', ')}`)
                  setFeedbackMessage(parts.length > 0 ? parts.join('；') : '没有需要分类的论文')
                } catch {
                  setErrorMessage('AI 自动分类失败')
                } finally {
                  setIsClassifying(false)
                }
              }}
            >
              {isClassifying ? '分类中...' : `AI 智能分类 (${totalPending})`}
            </button>
          )}

          <div className="category-list">
            <button
              type="button"
              className={`category-item${selectedCategoryId === null ? ' active' : ''}`}
              onClick={() => setSelectedCategoryId(null)}
            >
              <span>全部论文 ({papers.length})</span>
            </button>
            {visibleGroups.map((group) => (
              <button
                key={group.categoryIds.join(',')}
                type="button"
                className={`category-item${selectedCategoryId !== null && group.categoryIds.includes(selectedCategoryId) ? ' active' : ''}${group.isPendingBucket ? ' pending' : ''}`}
                onClick={() => setSelectedCategoryId(group.categoryIds[0])}
              >
                <span className="category-item-name">{group.name}</span>
                <span className="category-count-badge">{group.paperCount}</span>
              </button>
            ))}
            {dedupedCategories.length > CATEGORY_COLLAPSE_LIMIT && (
              <button
                type="button"
                className="category-accordion-toggle"
                onClick={() => setIsCategoryExpanded(prev => !prev)}
              >
                {isCategoryExpanded ? '收起 ▴' : `更多分类 (${hiddenCount}) ▾`}
              </button>
            )}
          </div>
        </aside>

        <main className="management-main">
          <section className="glass-card management-toolbar">
            <div className="management-toolbar-actions">
              <button type="button" className="btn btn-primary" onClick={() => setIsImportOpen(true)}>
                导入 PDF
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

          <div className="paper-management-grid">
            <section className="reading-list-panel glass-card management-list-panel">
              <PaperList
                papers={paginatedPapers}
                selectedPaperId={selectedPaperId}
                isLoading={isLoadingLibrary}
                onSelect={handleSelect}
                onDelete={handleDelete}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                allTags={allTags}
                activeTag={activeTag}
                onTagChange={setActiveTag}
                isBatchMode={isBatchMode}
                onBatchDelete={handleBatchDelete}
              />
              {filteredPapers.length > 0 && (
                <PaginationControl
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </section>

            <section className="reading-detail-panel">
              <PaperActions
                disabled={detail === null || isLoadingDetail}
                isRunningParse={isParseInProgress}
                isRunningSummarize={isSummarizeInProgress}
                isRunningEmbed={isEmbedInProgress}
                selectedModel={selectedModel}
                modelOptions={modelOptions}
                onModelChange={setSelectedModel}
                onParse={handleParse}
                onSummarize={handleSummarize}
                onEmbed={handleEmbed}
                onRefresh={handleRefresh}
              />
              <EmbeddingUnavailableNotice />
              <FeedbackBanner feedbackMessage={feedbackMessage} errorMessage={errorMessage} />
              <PaperDetail
                paper={detail}
                isLoading={isLoadingDetail}
                categories={categories}
                onCategoryChange={handlePrimaryCategoryChange}
                isUpdatingCategory={isUpdatingCategory}
                onGoBack={() => clearSelectedPaper(selectedPaperId)}
                onPrevPaper={() => {
                  const idx = visiblePapers.findIndex(p => p.id === selectedPaperId)
                  if (idx > 0) {
                    void handleSelect(visiblePapers[idx - 1])
                  }
                }}
                onNextPaper={() => {
                  const idx = visiblePapers.findIndex(p => p.id === selectedPaperId)
                  if (idx >= 0 && idx < visiblePapers.length - 1) {
                    void handleSelect(visiblePapers[idx + 1])
                  }
                }}
                hasPrev={(() => {
                  const idx = visiblePapers.findIndex(p => p.id === selectedPaperId)
                  return idx > 0
                })()}
                hasNext={(() => {
                  const idx = visiblePapers.findIndex(p => p.id === selectedPaperId)
                  return idx >= 0 && idx < visiblePapers.length - 1
                })()}
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

      {/* KPI Modal */}
      {kpiModalLabel && (
        <div className="kpi-modal-overlay" onClick={() => setKpiModalLabel(null)}>
          <div className="kpi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="kpi-modal-header">
              <h3>{kpiModalLabel}</h3>
              <span className="kpi-modal-count">{kpiModalPapers.length} 篇</span>
              <button type="button" className="kpi-modal-close" onClick={() => setKpiModalLabel(null)}>✕</button>
            </div>
            <div className="kpi-modal-list">
              {kpiModalPapers.length === 0 ? (
                <div className="kpi-modal-empty">暂无论文</div>
              ) : (
                kpiModalPapers.map(paper => (
                  <div
                    key={paper.id}
                    className="kpi-modal-item"
                    onClick={() => { setKpiModalLabel(null); handleSelect(paper) }}
                  >
                    <div className="kpi-modal-item-title">{paper.title}</div>
                    <div className="kpi-modal-item-meta">
                      {paper.source && <span>{paper.source}</span>}
                      {paper.updated_at && <span>{new Date(paper.updated_at).toLocaleDateString()}</span>}
                      <span className="kpi-modal-item-status">{paper.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
