import type { PaperDetail } from '../../types'
import { Icon } from '../UiIcon'
import type { ReaderMode } from './readerTypes'

type ReaderToolbarProps = {
  paper: PaperDetail
  mode: ReaderMode
  readingStatusLabel: string
  readingProgress: number
  autoSaved: boolean
  onBack: () => void
  onModeChange: (mode: ReaderMode) => void
}

export function ReaderToolbar({
  paper,
  mode,
  readingStatusLabel,
  readingProgress,
  autoSaved,
  onBack,
  onModeChange,
}: ReaderToolbarProps) {
  return (
    <header className="reader-toolbar-v2">
      <div className="reader-toolbar-row-main">
        <button className="btn btn-secondary" onClick={onBack} type="button">
          <Icon name="library" />
          返回论文库
        </button>
        <h1 className="reader-toolbar-title-v2">{paper.title}</h1>
        <div className="reader-mode-segmented" role="group" aria-label="阅读模式">
          <button
            aria-pressed={mode === 'markdown'}
            className={`segmented-btn${mode === 'markdown' ? ' active' : ''}`}
            onClick={() => onModeChange('markdown')}
            type="button"
          >
            <Icon name="fileText" />
            Markdown
          </button>
          <button
            aria-pressed={mode === 'pdf'}
            className={`segmented-btn${mode === 'pdf' ? ' active' : ''}`}
            onClick={() => onModeChange('pdf')}
            type="button"
          >
            <Icon name="pdf" />
            PDF
          </button>
        </div>
      </div>
      <div className="reader-status-bar">
        <span className="reader-status-label">{readingStatusLabel}</span>
        <span className="reader-status-sep">·</span>
        <span className="reader-status-progress">进度 {readingProgress}%</span>
        <span className="reader-status-sep">·</span>
        <span className="reader-status-saved">{autoSaved ? '已自动保存' : '正在保存…'}</span>
      </div>
    </header>
  )
}
