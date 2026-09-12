import type { CSSProperties, Dispatch, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Category, Paper, PaperDetail, PaperUpdatePayload, ReadingStatus } from '../../types'
import type { AiModelOption } from '../../lib/aiModels'
import { cn } from '@/lib/utils'
import { countParseFailedPapers, countPendingPapers } from './libraryFilters'
import { CategoryCreateForm } from './CategoryCreateForm'
import { LibraryDetailStack } from './LibraryDetailStack'
import { LibrarySidebar } from './LibrarySidebar'
import { LibraryToolbar } from './LibraryToolbar'
import { PaperLibraryList } from './PaperLibraryList'
import type { CategoryScope, FavoriteFilter, LibraryStatusFilter, ReadingStatusFilter } from './libraryTypes'

type LibraryWorkspaceLayoutProps = {
  papers: Paper[]
  categoryPapers: Paper[]
  categories: Category[]
  selectedPaperId: number | null
  selectedPaperIds: number[]
  selectedCategoryId: number | null
  categoryScope: CategoryScope
  isLoadingLibrary: boolean
  isCreateCategoryOpen: boolean
  newCategoryName: string
  newCategoryDescription: string
  searchQuery: string
  statusFilter: LibraryStatusFilter
  favoriteFilter: FavoriteFilter
  readingStatusFilter: ReadingStatusFilter
  activeTag: string | null
  detail: PaperDetail | null
  isLoadingDetail: boolean
  isUpdatingCategory: boolean
  feedbackMessage: string
  errorMessage: string
  isRunningParse: boolean
  isRunningSummarize: boolean
  isRunningEmbed: boolean
  isRunningSpisRescue?: boolean
  selectedModel: string
  modelOptions: AiModelOption[]
  isRetryingParseFailed: boolean
  isDeletingParseFailed: boolean
  onCategoryScopeChange: Dispatch<SetStateAction<CategoryScope>>
  onSelectCategory: Dispatch<SetStateAction<number | null>>
  onOpenImport: () => void
  onToggleCreateCategory: () => void
  onRefreshLibrary: () => Promise<void>
  onRetryParseFailed: () => Promise<void>
  onDeleteParseFailed: () => Promise<void>
  onNewCategoryNameChange: Dispatch<SetStateAction<string>>
  onNewCategoryDescriptionChange: Dispatch<SetStateAction<string>>
  onCreateCategory: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onSearchChange: Dispatch<SetStateAction<string>>
  onStatusFilterChange: Dispatch<SetStateAction<LibraryStatusFilter>>
  onFavoriteFilterChange: Dispatch<SetStateAction<FavoriteFilter>>
  onReadingStatusFilterChange: Dispatch<SetStateAction<ReadingStatusFilter>>
  onTagChange: Dispatch<SetStateAction<string | null>>
  onSelectPaper: (paper: Paper) => void
  onTogglePaperSelection: (paper: Paper) => void
  onToggleSelectAllFiltered: (papers: Paper[]) => void
  onClearPaperSelection: () => void
  onDeleteSelectedPapers: () => Promise<void> | void
  isDeletingSelectedPapers?: boolean
  onOpenAgentForSelected: () => void
  onDeletePaper: (paper: Paper) => Promise<void>
  onModelChange: Dispatch<SetStateAction<string>>
  onParse: () => Promise<void>
  onSummarize: () => Promise<void>
  onEmbed: () => Promise<void>
  onRefreshDetail: () => Promise<void>
  onCategoryChange: (categoryId: number) => Promise<void>
  onTagsChange: (tags: string[]) => Promise<void>
  onOpenReader: (paper: Paper) => void
  onSpisRescue?: (paper: Paper | PaperDetail) => Promise<void> | void
  onMetadataSave: (payload: PaperUpdatePayload) => Promise<void> | void
  onFavoriteChange: (favorite: boolean) => Promise<void> | void
  onReadingStateChange: (payload: { reading_status: ReadingStatus; reading_progress: number }) => Promise<void> | void
  onNotesSave: (userNotes: string) => Promise<void> | void
}

const DEFAULT_LIST_WIDTH = 390
const MIN_LIST_WIDTH = 280
const MAX_LIST_WIDTH = 720
const LIST_WIDTH_STORAGE_KEY = 'library.listWidth'

function clampListWidth(width: number): number {
  return Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(width)))
}

function readInitialListWidth(): number {
  try {
    const stored = window.localStorage.getItem(LIST_WIDTH_STORAGE_KEY)
    const parsed = stored ? Number(stored) : Number.NaN
    return Number.isFinite(parsed) ? clampListWidth(parsed) : DEFAULT_LIST_WIDTH
  } catch {
    return DEFAULT_LIST_WIDTH
  }
}

function persistListWidth(width: number): void {
  try {
    window.localStorage.setItem(LIST_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // localStorage 不可用时忽略（如隐私模式）
  }
}

export function LibraryWorkspaceLayout({
  papers,
  categoryPapers,
  categories,
  selectedPaperId,
  selectedPaperIds,
  selectedCategoryId,
  categoryScope,
  isLoadingLibrary,
  isCreateCategoryOpen,
  newCategoryName,
  newCategoryDescription,
  searchQuery,
  statusFilter,
  favoriteFilter,
  readingStatusFilter,
  activeTag,
  detail,
  isLoadingDetail,
  isUpdatingCategory,
  feedbackMessage,
  errorMessage,
  isRunningParse,
  isRunningSummarize,
  isRunningEmbed,
  isRunningSpisRescue = false,
  selectedModel,
  modelOptions,
  isRetryingParseFailed,
  isDeletingParseFailed,
  onCategoryScopeChange,
  onSelectCategory,
  onOpenImport,
  onToggleCreateCategory,
  onRefreshLibrary,
  onRetryParseFailed,
  onDeleteParseFailed,
  onNewCategoryNameChange,
  onNewCategoryDescriptionChange,
  onCreateCategory,
  onSearchChange,
  onStatusFilterChange,
  onFavoriteFilterChange,
  onReadingStatusFilterChange,
  onTagChange,
  onSelectPaper,
  onTogglePaperSelection,
  onToggleSelectAllFiltered,
  onClearPaperSelection,
  onDeleteSelectedPapers,
  isDeletingSelectedPapers = false,
  onOpenAgentForSelected,
  onDeletePaper,
  onModelChange,
  onParse,
  onSummarize,
  onEmbed,
  onRefreshDetail,
  onCategoryChange,
  onTagsChange,
  onOpenReader,
  onSpisRescue,
  onMetadataSave,
  onFavoriteChange,
  onReadingStateChange,
  onNotesSave,
}: LibraryWorkspaceLayoutProps) {
  const [listWidth, setListWidth] = useState(readInitialListWidth)
  const [isDraggingResizer, setIsDraggingResizer] = useState(false)
  const gridRef = useRef<HTMLDivElement | null>(null)

  const applyListWidth = useCallback((width: number) => {
    const next = clampListWidth(width)
    setListWidth(next)
    persistListWidth(next)
  }, [])

  const handleResizerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDraggingResizer(true)
    },
    [],
  )

  const handleResizerDoubleClick = useCallback(() => {
    applyListWidth(DEFAULT_LIST_WIDTH)
  }, [applyListWidth])

  const handleResizerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        applyListWidth(listWidth - 16)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        applyListWidth(listWidth + 16)
      }
    },
    [applyListWidth, listWidth],
  )

  useEffect(() => {
    if (!isDraggingResizer) return
    function handlePointerMove(event: PointerEvent) {
      const grid = gridRef.current
      if (!grid) return
      const rect = grid.getBoundingClientRect()
      applyListWidth(event.clientX - rect.left)
    }
    function stopDragging() {
      setIsDraggingResizer(false)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [applyListWidth, isDraggingResizer])

  useEffect(() => {
    if (!isDraggingResizer) return
    document.body.classList.add('library-resizing')
    return () => document.body.classList.remove('library-resizing')
  }, [isDraggingResizer])

  return (
    <div className="library-workspace">
      <LibrarySidebar
        papers={papers}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        categoryScope={categoryScope}
        onCategoryScopeChange={onCategoryScopeChange}
        onSelectCategory={onSelectCategory}
        onRefreshCategories={onRefreshLibrary}
      />
      <main className="library-main">
        <LibraryToolbar
          isLoadingLibrary={isLoadingLibrary}
          totalPapers={papers.length}
          pendingCount={countPendingPapers(papers)}
          parseFailedCount={countParseFailedPapers(papers)}
          isRetryingParseFailed={isRetryingParseFailed}
          isDeletingParseFailed={isDeletingParseFailed}
          onOpenImport={onOpenImport}
          onToggleCreateCategory={onToggleCreateCategory}
          onRefresh={onRefreshLibrary}
          onRetryParseFailed={onRetryParseFailed}
          onDeleteParseFailed={onDeleteParseFailed}
        />

        {isCreateCategoryOpen && (
          <CategoryCreateForm
            name={newCategoryName}
            description={newCategoryDescription}
            onNameChange={onNewCategoryNameChange}
            onDescriptionChange={onNewCategoryDescriptionChange}
            onSubmit={onCreateCategory}
          />
        )}

        <div
          className="library-grid"
          ref={gridRef}
          style={{ '--library-list-width': `${listWidth}px` } as CSSProperties}
        >
          <PaperLibraryList
            papers={categoryPapers}
            selectedPaperId={selectedPaperId}
            selectedPaperIds={selectedPaperIds}
            isLoading={isLoadingLibrary}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            favoriteFilter={favoriteFilter}
            readingStatusFilter={readingStatusFilter}
            activeTag={activeTag}
            onSearchChange={onSearchChange}
            onStatusFilterChange={onStatusFilterChange}
            onFavoriteFilterChange={onFavoriteFilterChange}
            onReadingStatusFilterChange={onReadingStatusFilterChange}
            onTagChange={onTagChange}
            onSelect={onSelectPaper}
            onToggleSelection={onTogglePaperSelection}
            onToggleSelectAllFiltered={onToggleSelectAllFiltered}
            onClearSelection={onClearPaperSelection}
            onDeleteSelected={onDeleteSelectedPapers}
            isDeletingSelected={isDeletingSelectedPapers}
            onOpenAgentForSelected={onOpenAgentForSelected}
            onDelete={onDeletePaper}
            onSpisRescue={onSpisRescue}
            isRunningSpisRescue={isRunningSpisRescue}
          />
          <div
            aria-label="调整列表宽度"
            aria-orientation="vertical"
            aria-valuenow={listWidth}
            aria-valuemin={MIN_LIST_WIDTH}
            aria-valuemax={MAX_LIST_WIDTH}
            className={cn('library-resizer', isDraggingResizer && 'is-dragging')}
            onDoubleClick={handleResizerDoubleClick}
            onKeyDown={handleResizerKeyDown}
            onPointerDown={handleResizerPointerDown}
            role="separator"
            tabIndex={0}
            title="拖动调整列表宽度（双击重置）"
          />
          <LibraryDetailStack
            detail={detail}
            categories={categories}
            isLoadingDetail={isLoadingDetail}
            isUpdatingCategory={isUpdatingCategory}
            feedbackMessage={feedbackMessage}
            errorMessage={errorMessage}
            isRunningParse={isRunningParse}
            isRunningSummarize={isRunningSummarize}
            isRunningEmbed={isRunningEmbed}
            isRunningSpisRescue={isRunningSpisRescue}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            onModelChange={onModelChange}
            onParse={onParse}
            onSummarize={onSummarize}
            onEmbed={onEmbed}
            onRefresh={onRefreshDetail}
            onCategoryChange={onCategoryChange}
            onTagsChange={onTagsChange}
            onOpenReader={onOpenReader}
            onSpisRescue={onSpisRescue}
            onMetadataSave={onMetadataSave}
            onFavoriteChange={onFavoriteChange}
            onReadingStateChange={onReadingStateChange}
            onNotesSave={onNotesSave}
          />
        </div>
      </main>
    </div>
  )
}
