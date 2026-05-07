import type { Category, PaperDetail, PaperUpdatePayload, ReadingStatus } from '../../types'
import { FeedbackBanner } from '../FeedbackBanner'
import { PaperActions } from '../PaperActions'
import { PaperMetadataPanel } from './PaperMetadataPanel'
import { PaperOverviewPanel } from './PaperOverviewPanel'

type LibraryDetailStackProps = {
  detail: PaperDetail | null
  categories: Category[]
  isLoadingDetail: boolean
  isUpdatingCategory: boolean
  feedbackMessage: string
  errorMessage: string
  isRunningParse: boolean
  isRunningSummarize: boolean
  isRunningEmbed: boolean
  selectedModel: string
  onModelChange: (model: string) => void
  onParse: () => Promise<void>
  onSummarize: () => Promise<void>
  onEmbed: () => Promise<void>
  onRefresh: () => Promise<void>
  onCategoryChange: (categoryId: number) => Promise<void> | void
  onTagsChange: (tags: string[]) => Promise<void> | void
  onOpenReader: (paper: PaperDetail) => void
  onMetadataSave: (payload: PaperUpdatePayload) => Promise<void> | void
  onFavoriteChange: (favorite: boolean) => Promise<void> | void
  onReadingStateChange: (payload: { reading_status: ReadingStatus; reading_progress: number }) => Promise<void> | void
  onNotesSave: (userNotes: string) => Promise<void> | void
}

export function LibraryDetailStack({
  detail,
  categories,
  isLoadingDetail,
  isUpdatingCategory,
  feedbackMessage,
  errorMessage,
  isRunningParse,
  isRunningSummarize,
  isRunningEmbed,
  selectedModel,
  onModelChange,
  onParse,
  onSummarize,
  onEmbed,
  onRefresh,
  onCategoryChange,
  onTagsChange,
  onOpenReader,
  onMetadataSave,
  onFavoriteChange,
  onReadingStateChange,
  onNotesSave,
}: LibraryDetailStackProps) {
  return (
    <section className="library-detail-stack">
      <PaperActions
        disabled={detail === null || isLoadingDetail}
        isRunningParse={isRunningParse || detail?.parse_status === 'processing'}
        isRunningSummarize={isRunningSummarize || detail?.summary_status === 'processing'}
        isRunningEmbed={isRunningEmbed || detail?.embedding_status === 'processing'}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        onParse={onParse}
        onSummarize={onSummarize}
        onEmbed={onEmbed}
        onRefresh={onRefresh}
      />
      <FeedbackBanner feedbackMessage={feedbackMessage} errorMessage={errorMessage} />
      <PaperMetadataPanel
        paper={detail}
        categories={categories}
        isLoading={isLoadingDetail}
        isUpdatingCategory={isUpdatingCategory}
        onCategoryChange={onCategoryChange}
        onTagsChange={onTagsChange}
        onOpenReader={onOpenReader}
        onMetadataSave={onMetadataSave}
        onFavoriteChange={onFavoriteChange}
        onReadingStateChange={onReadingStateChange}
        onNotesSave={onNotesSave}
      />
      <PaperOverviewPanel paper={detail} />
    </section>
  )
}
