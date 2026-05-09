import type { Dispatch, FormEvent, SetStateAction } from 'react'

import type { Category, Paper, PaperDetail, PaperUpdatePayload, ReadingStatus } from '../../types'
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
  selectedModel: string
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
  onDeletePaper: (paper: Paper) => Promise<void>
  onModelChange: Dispatch<SetStateAction<string>>
  onParse: () => Promise<void>
  onSummarize: () => Promise<void>
  onEmbed: () => Promise<void>
  onRefreshDetail: () => Promise<void>
  onCategoryChange: (categoryId: number) => Promise<void>
  onTagsChange: (tags: string[]) => Promise<void>
  onOpenReader: (paper: Paper) => void
  onMetadataSave: (payload: PaperUpdatePayload) => Promise<void> | void
  onFavoriteChange: (favorite: boolean) => Promise<void> | void
  onReadingStateChange: (payload: { reading_status: ReadingStatus; reading_progress: number }) => Promise<void> | void
  onNotesSave: (userNotes: string) => Promise<void> | void
}

export function LibraryWorkspaceLayout({
  papers,
  categoryPapers,
  categories,
  selectedPaperId,
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
  selectedModel,
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
  onDeletePaper,
  onModelChange,
  onParse,
  onSummarize,
  onEmbed,
  onRefreshDetail,
  onCategoryChange,
  onTagsChange,
  onOpenReader,
  onMetadataSave,
  onFavoriteChange,
  onReadingStateChange,
  onNotesSave,
}: LibraryWorkspaceLayoutProps) {
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

        <div className="library-grid">
          <PaperLibraryList
            papers={categoryPapers}
            selectedPaperId={selectedPaperId}
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
            onDelete={onDeletePaper}
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
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            onParse={onParse}
            onSummarize={onSummarize}
            onEmbed={onEmbed}
            onRefresh={onRefreshDetail}
            onCategoryChange={onCategoryChange}
            onTagsChange={onTagsChange}
            onOpenReader={onOpenReader}
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
