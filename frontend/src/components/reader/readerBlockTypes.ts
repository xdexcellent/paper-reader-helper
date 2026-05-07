import type { PaperBlockTranslation } from '../../types'

export type ReaderBlockFilters = {
  page: string
  type: string
  search: string
}

export type ReaderBlockTranslationState = {
  translation?: PaperBlockTranslation | null
  isLoading?: boolean
  errorMessage?: string
}

export type ReaderBlockTranslationView = {
  label: string
  tone: 'idle' | 'loading' | 'success' | 'warning' | 'error'
  isStale: boolean
}
