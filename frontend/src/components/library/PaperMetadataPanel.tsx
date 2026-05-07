import { useEffect, useState, type FormEvent } from 'react'

import type { Category, PaperDetail, PaperUpdatePayload, ReadingStatus } from '../../types'
import { StatusBadge } from '../StatusBadge'
import { Icon } from '../UiIcon'
import { PaperTagEditor } from './PaperTagEditor'

type PaperMetadataPanelProps = {
  paper: PaperDetail | null
  categories: Category[]
  isLoading: boolean
  isUpdatingCategory: boolean
  onCategoryChange: (categoryId: number) => Promise<void> | void
  onTagsChange?: (tags: string[]) => Promise<void> | void
  onOpenReader?: (paper: PaperDetail) => void
  onMetadataSave?: (payload: PaperUpdatePayload) => Promise<void> | void
  onFavoriteChange?: (favorite: boolean) => Promise<void> | void
  onReadingStateChange?: (payload: {
    reading_status: ReadingStatus
    reading_progress: number
  }) => Promise<void> | void
  onNotesSave?: (userNotes: string) => Promise<void> | void
}

type MetadataForm = {
  title: string
  authors: string
  year: string
  venue: string
  doi: string
  url: string
  abstract_raw: string
}

const emptyMetadata: MetadataForm = {
  title: '',
  authors: '',
  year: '',
  venue: '',
  doi: '',
  url: '',
  abstract_raw: '',
}

const readingOptions: { value: ReadingStatus; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'skipped', label: 'Skipped' },
]

const metadataFields: {
  field: Exclude<keyof MetadataForm, 'abstract_raw'>
  label: string
  inputMode?: 'numeric'
}[] = [
  { field: 'title', label: 'Title' },
  { field: 'authors', label: 'Authors' },
  { field: 'year', label: 'Year', inputMode: 'numeric' },
  { field: 'venue', label: 'Venue' },
  { field: 'doi', label: 'DOI' },
  { field: 'url', label: 'URL' },
]

function metadataFromPaper(paper: PaperDetail | null): MetadataForm {
  if (!paper) return emptyMetadata
  return {
    title: paper.title,
    authors: paper.authors ?? '',
    year: paper.year == null ? '' : String(paper.year),
    venue: paper.venue ?? '',
    doi: paper.doi ?? '',
    url: paper.url ?? '',
    abstract_raw: paper.abstract_raw ?? '',
  }
}

export function PaperMetadataPanel({
  paper,
  categories,
  isLoading,
  isUpdatingCategory,
  onCategoryChange,
  onTagsChange,
  onOpenReader,
  onMetadataSave,
  onFavoriteChange,
  onReadingStateChange,
  onNotesSave,
}: PaperMetadataPanelProps) {
  const [metadata, setMetadata] = useState<MetadataForm>(emptyMetadata)
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>('unread')
  const [readingProgress, setReadingProgress] = useState('0')
  const [notes, setNotes] = useState('')
  const [notesError, setNotesError] = useState('')

  useEffect(() => {
    setMetadata(metadataFromPaper(paper))
    setReadingStatus(paper?.reading_status ?? 'unread')
    setReadingProgress(String(paper?.reading_progress ?? 0))
    setNotes(paper?.user_notes ?? '')
    setNotesError('')
  }, [paper?.id, paper?.tags])

  if (isLoading) {
    return (
      <section className="paper-metadata-panel" aria-busy="true">
        <span className="spinner" />
        <span>Loading paper metadata...</span>
      </section>
    )
  }

  if (!paper) {
    return (
      <section className="paper-metadata-panel paper-panel-empty">
        <Icon name="library" />
        <span>Select a paper to inspect metadata.</span>
      </section>
    )
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onMetadataSave?.({
      title: metadata.title,
      authors: metadata.authors,
      year: metadata.year.trim() ? Number(metadata.year) : null,
      venue: metadata.venue,
      doi: metadata.doi,
      url: metadata.url,
      abstract_raw: metadata.abstract_raw,
    })
  }

  async function saveReadingState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onReadingStateChange?.({
      reading_status: readingStatus,
      reading_progress: Number(readingProgress),
    })
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotesError('')
    try {
      await onNotesSave?.(notes)
    } catch {
      setNotesError('Notes save failed')
    }
  }

  function updateMetadata(field: keyof MetadataForm, value: string) {
    setMetadata((current) => ({ ...current, [field]: value }))
  }

  return (
    <section className="paper-metadata-panel" aria-label="Paper metadata">
      <div className="paper-metadata-header">
        <div>
          <p className="panel-chip">Metadata</p>
          <h2>{paper.title}</h2>
        </div>
        <button
          aria-label={paper.favorite ? 'Unfavorite paper' : 'Favorite paper'}
          aria-pressed={paper.favorite ?? false}
          className="btn btn-secondary"
          onClick={() => void onFavoriteChange?.(!(paper.favorite ?? false))}
          type="button"
        >
          <Icon name="spark" />
          {paper.favorite ? 'Favorited' : 'Favorite'}
        </button>
        <button
          aria-label="Open reader"
          className="btn btn-primary"
          onClick={() => onOpenReader?.(paper)}
          type="button"
        >
          <Icon name="book" />
          Open reader
        </button>
      </div>

      <div className="paper-metadata-grid">
        <div>
          <span className="metadata-label">Source</span>
          <strong>{paper.source}</strong>
        </div>
        <div>
          <span className="metadata-label">Paper status</span>
          <StatusBadge value={paper.status} />
        </div>
        <div>
          <span className="metadata-label">Parse</span>
          <StatusBadge value={paper.parse_status} />
        </div>
        <div>
          <span className="metadata-label">Summary</span>
          <StatusBadge value={paper.summary_status} />
        </div>
        <div>
          <span className="metadata-label">Embedding</span>
          <StatusBadge value={paper.embedding_status} />
        </div>
      </div>

      {categories.length > 0 && (
        <label className="library-control" htmlFor="paper-metadata-category">
          <span>Primary category</span>
          <select
            disabled={isUpdatingCategory}
            id="paper-metadata-category"
            onChange={(event) => {
              const categoryId = Number(event.target.value)
              if (!Number.isNaN(categoryId)) {
                void onCategoryChange(categoryId)
              }
            }}
            value={paper.primary_category_id ?? ''}
          >
            <option value="" disabled>
              Choose category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="paper-category-meta">
        <StatusBadge value={paper.category_status ?? 'unclassified'} />
        {paper.category_confidence !== undefined && (
          <span>{Math.round(paper.category_confidence * 100)}% confidence</span>
        )}
      </div>

      {paper.category_reason && (
        <p className="paper-category-reason">{paper.category_reason}</p>
      )}

      <form className="paper-metadata-edit" onSubmit={saveMetadata}>
        {metadataFields.map(({ field, label, inputMode }) => (
          <label className="library-control" htmlFor={`paper-metadata-${field}`} key={field}>
            <span>{label}</span>
            <input
              id={`paper-metadata-${field}`}
              inputMode={inputMode}
              onChange={(event) => updateMetadata(field, event.target.value)}
              value={metadata[field]}
            />
          </label>
        ))}
        <label className="library-control metadata-wide-field" htmlFor="paper-metadata-abstract">
          <span>Abstract</span>
          <textarea id="paper-metadata-abstract" onChange={(event) => updateMetadata('abstract_raw', event.target.value)} value={metadata.abstract_raw} />
        </label>
        <button className="btn btn-secondary metadata-wide-field" type="submit">Save metadata</button>
      </form>

      <form className="paper-reading-edit" onSubmit={saveReadingState}>
        <label className="library-control" htmlFor="paper-reading-status">
          <span>Reading status</span>
          <select id="paper-reading-status" onChange={(event) => setReadingStatus(event.target.value as ReadingStatus)} value={readingStatus}>
            {readingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="library-control" htmlFor="paper-reading-progress">
          <span>Reading progress</span>
          <input id="paper-reading-progress" max="100" min="0" onChange={(event) => setReadingProgress(event.target.value)} type="number" value={readingProgress} />
        </label>
        <button className="btn btn-secondary" type="submit">Save reading state</button>
      </form>

      <form className="paper-notes-edit" onSubmit={saveNotes}>
        <label className="library-control" htmlFor="paper-user-notes">
          <span>User notes</span>
          <textarea id="paper-user-notes" onChange={(event) => setNotes(event.target.value)} value={notes} />
        </label>
        {notesError && <p className="form-error">{notesError}</p>}
        <button className="btn btn-secondary" type="submit">Save notes</button>
      </form>

      <PaperTagEditor key={paper.id} onTagsChange={onTagsChange} tags={paper.tags ?? []} />
    </section>
  )
}
