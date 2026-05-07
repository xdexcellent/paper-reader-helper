import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  fetchPaperDetail,
  getPdfBlobUrl,
  parsePaper,
  updatePaperNotes,
  updatePaperReadingState,
  waitForTaskCompletion,
} from '../../lib/api'
import type { PaperDetail, ReadingStatus } from '../../types'
import { ReaderShell } from './ReaderShell'
import type { ReaderMode } from './readerTypes'
import { useReaderBlocks } from './useReaderBlocks'

type ReaderPageProps = {
  refreshLibrary: () => Promise<void>
}

type ReadingStatePayload = {
  reading_status: ReadingStatus
  reading_progress: number
}

function revokeBlobUrl(url: string) {
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

const readingStatusLabels: Record<ReadingStatus, string> = {
  unread: '未读',
  reading: '阅读中',
  read: '已读',
  skipped: '已跳过',
}

export function ReaderPage({ refreshLibrary }: ReaderPageProps) {
  const { paperId } = useParams()
  const navigate = useNavigate()
  const numericPaperId = Number(paperId)
  const [paper, setPaper] = useState<PaperDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mode, setMode] = useState<ReaderMode>('markdown')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfPage, setPdfPage] = useState<number | null>(null)
  const [pdfError, setPdfError] = useState('')
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [isUpdatingReadingState, setIsUpdatingReadingState] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const detailRequestRef = useRef(0)
  const pdfRequestRef = useRef(0)
  const pdfUrlRef = useRef<string | null>(null)
  const autoMarkedPaperIdsRef = useRef(new Set<number>())
  const isMountedRef = useRef(true)
  const refreshLibraryRef = useRef(refreshLibrary)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<ReadingStatePayload | null>(null)

  useEffect(() => {
    refreshLibraryRef.current = refreshLibrary
  }, [refreshLibrary])

  const revokeCurrentPdfUrl = useCallback((updateState = true) => {
    if (pdfUrlRef.current) {
      revokeBlobUrl(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
    if (updateState) setPdfUrl(null)
  }, [])

  const openPdfPage = useCallback((pageNumber: number | null) => {
    setPdfPage(pageNumber)
    setMode('pdf')
  }, [])

  const { reloadBlocks, ...blockShellProps } = useReaderBlocks(paper, openPdfPage)

  const loadPaper = useCallback(async (loading = true) => {
    const requestId = detailRequestRef.current + 1
    detailRequestRef.current = requestId
    if (!Number.isFinite(numericPaperId)) {
      setPaper(null)
      setIsLoading(false)
      return
    }
    if (loading) setIsLoading(true)
    try {
      const nextPaper = await fetchPaperDetail(numericPaperId)
      if (detailRequestRef.current === requestId && isMountedRef.current) {
        setPaper(nextPaper)
      }
    } finally {
      if (loading && detailRequestRef.current === requestId && isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [numericPaperId])

  const loadPdf = useCallback(async () => {
    if (!paper?.id) return
    const requestId = pdfRequestRef.current + 1
    pdfRequestRef.current = requestId
    setIsPdfLoading(true)
    setPdfError('')
    try {
      const nextUrl = await getPdfBlobUrl(paper.id)
      if (pdfRequestRef.current !== requestId || !isMountedRef.current) {
        revokeBlobUrl(nextUrl)
        return
      }
      revokeCurrentPdfUrl(false)
      pdfUrlRef.current = nextUrl
      setPdfUrl(nextUrl)
    } catch (error) {
      if (pdfRequestRef.current === requestId && isMountedRef.current) {
        revokeCurrentPdfUrl()
        setPdfError(error instanceof Error ? error.message : 'Failed to load PDF')
      }
    } finally {
      if (pdfRequestRef.current === requestId && isMountedRef.current) {
        setIsPdfLoading(false)
      }
    }
  }, [paper?.id, revokeCurrentPdfUrl])

  useEffect(() => {
    setMode('markdown')
    setPdfPage(null)
    pdfRequestRef.current += 1
    revokeCurrentPdfUrl()
    void loadPaper()
  }, [loadPaper, revokeCurrentPdfUrl])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      pdfRequestRef.current += 1
      revokeCurrentPdfUrl(false)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [revokeCurrentPdfUrl])

  // 首次打开未读论文自动标记为"阅读中"
  useEffect(() => {
    if (!paper || paper.reading_status !== 'unread' || autoMarkedPaperIdsRef.current.has(paper.id)) return
    let cancelled = false
    autoMarkedPaperIdsRef.current.add(paper.id)
    const payload = {
      reading_status: 'reading' as const,
      reading_progress: paper.reading_progress ?? 0,
    }
    setIsUpdatingReadingState(true)
    Promise.resolve(updatePaperReadingState(paper.id, payload))
      .then(() => {
        if (cancelled) return
        setPaper((current) => current?.id === paper.id
          ? { ...current, reading_status: 'reading' }
          : current)
        lastSavedRef.current = { reading_status: 'reading', reading_progress: payload.reading_progress }
        setAutoSaved(true)
        void refreshLibraryRef.current()
      })
      .catch(() => {
        autoMarkedPaperIdsRef.current.delete(paper.id)
      })
      .finally(() => {
        if (!cancelled) setIsUpdatingReadingState(false)
      })
    return () => {
      cancelled = true
    }
  }, [paper?.id, paper?.reading_progress, paper?.reading_status])

  // 自动保存：阅读状态或进度变化时 debounce 500ms 后自动保存
  useEffect(() => {
    if (!paper) return
    const currentStatus = paper.reading_status ?? 'unread'
    const currentProgress = paper.reading_progress ?? 0
    const lastSaved = lastSavedRef.current

    // 首次加载：记录初始值，不触发保存
    if (!lastSaved) {
      lastSavedRef.current = { reading_status: currentStatus, reading_progress: currentProgress }
      return
    }

    // 与上次保存值相同，不触发
    if (lastSaved.reading_status === currentStatus && lastSaved.reading_progress === currentProgress) {
      return
    }

    setAutoSaved(false)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)

    autoSaveTimerRef.current = setTimeout(() => {
      if (!paper?.id || !isMountedRef.current) return
      const payload: ReadingStatePayload = {
        reading_status: currentStatus,
        reading_progress: currentProgress,
      }
      void (async () => {
        try {
          await updatePaperReadingState(paper.id!, payload)
          lastSavedRef.current = payload
          setAutoSaved(true)
          setPaper((current) => current?.id === paper.id ? { ...current, reading_status: currentStatus, reading_progress: currentProgress } : current)
          void refreshLibraryRef.current()
        } catch {
          // 自动保存静默失败
        }
      })()
    }, 500)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [paper?.id, paper?.reading_progress, paper?.reading_status])

  useEffect(() => {
    if (mode !== 'pdf' || !paper) return
    void loadPdf()
  }, [loadPdf, mode, paper?.id])

  function handleBack() {
    const targetPaperId = paper?.id ?? numericPaperId
    navigate(Number.isFinite(targetPaperId) ? `/paper/${targetPaperId}` : '/')
  }

  function handleModeChange(nextMode: ReaderMode) {
    setPdfPage(null)
    if (nextMode !== 'pdf') {
      pdfRequestRef.current += 1
      revokeCurrentPdfUrl()
      setPdfError('')
    }
    setMode(nextMode)
  }

  async function handleParse() {
    if (!paper) return
    setIsParsing(true)
    try {
      const result = await parsePaper(paper.id)
      if (typeof result.task_id === 'string' && result.task_id) {
        await waitForTaskCompletion(result.task_id)
      }
      await loadPaper(false)
      await reloadBlocks(false)
      await refreshLibraryRef.current()
    } finally {
      setIsParsing(false)
    }
  }

  async function handleNotesSave(notes: string) {
    if (!paper) return
    setIsSavingNotes(true)
    try {
      const updatedPaper = await updatePaperNotes(paper.id, notes)
      setPaper((current) => current?.id === paper.id ? { ...current, ...updatedPaper } : current)
      await refreshLibraryRef.current()
    } finally {
      setIsSavingNotes(false)
    }
  }

  function handleDrawerToggle() {
    setDrawerOpen((v) => !v)
  }

  const visiblePdfUrl = pdfUrl && pdfPage ? `${pdfUrl}#page=${pdfPage}` : pdfUrl

  const readingStatus = paper?.reading_status ?? 'unread'
  const readingStatusLabel = readingStatusLabels[readingStatus]
  const readingProgress = paper?.reading_progress ?? 0

  return (
    <ReaderShell
      autoSaved={autoSaved}
      blockError={blockShellProps.blockError}
      blockFilters={blockShellProps.blockFilters}
      blocks={blockShellProps.blocks}
      drawerOpen={drawerOpen}
      isBlocksLoading={blockShellProps.isBlocksLoading}
      isBlocksRebuilding={blockShellProps.isBlocksRebuilding}
      isLoading={isLoading}
      isParsing={isParsing}
      isPdfLoading={isPdfLoading}
      isSavingNotes={isSavingNotes}
      mode={mode}
      onBack={handleBack}
      onBlockFiltersChange={blockShellProps.onBlockFiltersChange}
      onBlockForceRefreshTranslation={blockShellProps.onBlockForceRefreshTranslation}
      onBlockOpenPage={blockShellProps.onBlockOpenPage}
      onBlockRebuild={blockShellProps.onBlockRebuild}
      onBlockSelect={blockShellProps.onBlockSelect}
      onBlockTranslate={blockShellProps.onBlockTranslate}
      onDrawerToggle={handleDrawerToggle}
      onModeChange={handleModeChange}
      onNotesSave={handleNotesSave}
      onParse={handleParse}
      onPdfRetry={loadPdf}
      paper={paper}
      pdfError={pdfError}
      pdfUrl={visiblePdfUrl}
      readingProgress={readingProgress}
      readingStatusLabel={readingStatusLabel}
      selectedBlockId={blockShellProps.selectedBlockId}
      translationStates={blockShellProps.translationStates}
    />
  )
}
