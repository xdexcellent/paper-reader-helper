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
      '元数据已更新',
      '元数据更新失败',
    ),
    handleFavoriteChange: (favorite: boolean) => runUpdate(
      (paperId) => updatePaperFavorite(paperId, favorite),
      favorite ? '已收藏' : '已取消收藏',
      '收藏更新失败',
    ),
    handleReadingStateChange: (payload: ReadingStatePayload) => runUpdate(
      (paperId) => updatePaperReadingState(paperId, payload),
      '阅读状态已更新',
      '阅读状态更新失败',
    ),
    handleNotesSave: (userNotes: string) => runUpdate(
      (paperId) => updatePaperNotes(paperId, userNotes),
      '笔记已保存',
      '笔记保存失败',
      { rethrow: true },
    ),
  }
}
