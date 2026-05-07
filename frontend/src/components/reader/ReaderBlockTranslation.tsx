import type { PaperBlock } from '../../types'
import { StatusBadge } from '../StatusBadge'
import { Icon } from '../UiIcon'
import type { ReaderBlockTranslationState } from './readerBlockTypes'
import { getTranslationViewState } from './readerBlockUtils'

type ReaderBlockTranslationProps = {
  block: PaperBlock
  state?: ReaderBlockTranslationState
  onForceRefresh?: (block: PaperBlock) => void
  onTranslate: (block: PaperBlock) => void
}

export function ReaderBlockTranslation({
  block,
  state = {},
  onForceRefresh,
  onTranslate,
}: ReaderBlockTranslationProps) {
  const view = getTranslationViewState(block, state)

  if (view.tone === 'loading') {
    return (
      <section className="reader-block-translation" aria-live="polite">
        <span className="spinner" />
        <span>正在翻译段落...</span>
      </section>
    )
  }

  if (view.tone === 'error') {
    return (
      <section className="reader-block-translation translation-error">
        <div className="reader-block-translation-header">
          <StatusBadge value="failed" />
          <strong>翻译失败</strong>
        </div>
        {state.errorMessage && <p>{state.errorMessage}</p>}
        <button className="btn btn-secondary" onClick={() => onTranslate(block)} type="button">
          <Icon name="refresh" />
          重试翻译
        </button>
      </section>
    )
  }

  if (!state.translation) {
    return (
      <section className="reader-block-translation">
        <button className="btn btn-secondary" onClick={() => onTranslate(block)} type="button">
          <Icon name="spark" />
          翻译段落
        </button>
      </section>
    )
  }

  return (
    <section className="reader-block-translation" data-stale={view.isStale ? 'true' : undefined}>
      <div className="reader-block-translation-header">
        <StatusBadge value={view.isStale ? 'warning' : 'completed'} />
        <strong>{view.label}</strong>
      </div>
      <p>{state.translation.translated_text}</p>
      {view.isStale && (
        <button
          className="btn btn-secondary"
          onClick={() => (onForceRefresh ?? onTranslate)(block)}
          type="button"
        >
          <Icon name="refresh" />
          刷新翻译
        </button>
      )}
    </section>
  )
}
