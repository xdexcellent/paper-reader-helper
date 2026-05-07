import { useEffect, useState, type FormEvent } from 'react'

import type { PaperDetail } from '../../types'

type ReaderNotesPanelProps = {
  paper: PaperDetail | null
  isSaving: boolean
  onSave: (notes: string) => Promise<void> | void
}

export function ReaderNotesPanel({ paper, isSaving, onSave }: ReaderNotesPanelProps) {
  const [notes, setNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setNotes(paper?.user_notes ?? '')
    setErrorMessage('')
  }, [paper?.id, paper?.user_notes])

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    try {
      await onSave(notes)
    } catch {
      setErrorMessage('Notes save failed')
    }
  }

  if (!paper) {
    return (
      <section className="reader-notes-panel reader-empty-state">
        <span>Select a paper to edit notes.</span>
      </section>
    )
  }

  return (
    <form className="reader-notes-panel" onSubmit={saveNotes}>
      <label className="library-control" htmlFor="reader-notes">
        <span>Reader notes</span>
        <textarea id="reader-notes" onChange={(event) => setNotes(event.target.value)} value={notes} />
      </label>
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <button className="btn btn-secondary" disabled={isSaving} type="submit">
        Save notes
      </button>
    </form>
  )
}
