import type { Dispatch, SetStateAction } from 'react'

import {
  updatePaper,
  updatePaperFavorite,
  updatePaperNotes,
  updatePaperReadingState,
} from '../../lib/api'
import type { PaperDetail, PaperUpdatePayload, ReadingStatus } from '../../types'

type LoadPaperDetail = (
  id: number,
  options?: { reset?: boolean; loading?: boolean },
) => Promise<void>

type LibraryMetadataActionParams = {
  detail: PaperDetail | null
  refreshLibrary: () => Promise<void>
  loadPaperDetail: LoadPaperDetail
  setFeedbackMessage: Dispatch<SetStateAction<string>>
  setErrorMessage: Dispatch<SetStateAction<string>>
}

type ReadingStatePayload = {
  reading_status: ReadingStatus
  reading_progress: number
}

export function createLibraryMetadataActions({
  detail,
  refreshLibrary,
  loadPaperDetail,
  setFeedbackMessage,
  setErrorMessage,
}: LibraryMetadataActionParams) {
  async function runUpdate(
    action: (paperId: number) => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
    options: { rethrow?: boolean } = {},
  ) {
    if (!detail) return
    setErrorMessage('')
    try {
      await action(detail.id)
      await refreshLibrary()
      await loadPaperDetail(detail.id, { reset: false, loading: false })
      setFeedbackMessage(successMessage)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : failureMessage)
      if (options.rethrow) throw error
    }
  }

  return {
    handleMetadataSave: (payload: PaperUpdatePayload) => runUpdate(
      (paperId) => updatePaper(paperId, payload),
      'Metadata updated',
      'Failed to update metadata',
    ),
    handleFavoriteChange: (favorite: boolean) => runUpdate(
      (paperId) => updatePaperFavorite(paperId, favorite),
      favorite ? 'Added to favorites' : 'Removed from favorites',
      'Failed to update favorite',
    ),
    handleReadingStateChange: (payload: ReadingStatePayload) => runUpdate(
      (paperId) => updatePaperReadingState(paperId, payload),
      'Reading state updated',
      'Failed to update reading state',
    ),
    handleNotesSave: (userNotes: string) => runUpdate(
      (paperId) => updatePaperNotes(paperId, userNotes),
      'Notes saved',
      'Failed to save notes',
      { rethrow: true },
    ),
  }
}
