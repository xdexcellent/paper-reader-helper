import { useEffect, useState, type FormEvent } from 'react'

import type { PaperDetail, ReadingStatus } from '../../types'
import { StatusBadge } from '../StatusBadge'
import { Icon } from '../UiIcon'
import type { ReaderMode } from './readerTypes'

type ReaderToolbarProps = {
  paper: PaperDetail
  mode: ReaderMode
  isUpdatingReadingState: boolean
  onBack: () => void
  onModeChange: (mode: ReaderMode) => void
  onReadingStateChange: (payload: {
    reading_status: ReadingStatus
    reading_progress: number
  }) => Promise<void> | void
}

const readingOptions: { value: ReadingStatus; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'skipped', label: 'Skipped' },
]

export function ReaderToolbar({
  paper,
  mode,
  isUpdatingReadingState,
  onBack,
  onModeChange,
  onReadingStateChange,
}: ReaderToolbarProps) {
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>(paper.reading_status ?? 'unread')
  const [readingProgress, setReadingProgress] = useState(String(paper.reading_progress ?? 0))

  useEffect(() => {
    setReadingStatus(paper.reading_status ?? 'unread')
    setReadingProgress(String(paper.reading_progress ?? 0))
  }, [paper.id, paper.reading_status, paper.reading_progress])

  async function saveReadingState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onReadingStateChange({
      reading_status: readingStatus,
      reading_progress: Number(readingProgress),
    })
  }

  return (
    <header className="reader-toolbar">
      <button className="btn btn-secondary" onClick={onBack} type="button">
        <Icon name="library" />
        Back to library
      </button>
      <div className="reader-toolbar-title">
        <h1>{paper.title}</h1>
        <StatusBadge value={paper.status} />
      </div>
      <div className="reader-mode-toggle" role="group" aria-label="Reader mode">
        <button aria-label="PDF mode" aria-pressed={mode === 'pdf'} className="btn btn-secondary" onClick={() => onModeChange('pdf')} type="button">
          <Icon name="pdf" />
          PDF
        </button>
        <button aria-label="Markdown mode" aria-pressed={mode === 'markdown'} className="btn btn-secondary" onClick={() => onModeChange('markdown')} type="button">
          <Icon name="fileText" />
          Markdown
        </button>
      </div>
      <form className="reader-state-form" onSubmit={saveReadingState}>
        <label className="library-control" htmlFor="reader-reading-status">
          <span>Reading status</span>
          <select id="reader-reading-status" onChange={(event) => setReadingStatus(event.target.value as ReadingStatus)} value={readingStatus}>
            {readingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="library-control" htmlFor="reader-reading-progress">
          <span>Reading progress</span>
          <input id="reader-reading-progress" max="100" min="0" onChange={(event) => setReadingProgress(event.target.value)} type="number" value={readingProgress} />
        </label>
        <button className="btn btn-secondary" disabled={isUpdatingReadingState} type="submit">
          Save reading state
        </button>
      </form>
    </header>
  )
}
