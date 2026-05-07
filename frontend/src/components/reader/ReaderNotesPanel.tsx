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
      setErrorMessage('笔记保存失败')
    }
  }

  if (!paper) {
    return (
      <section className="reader-notes-panel reader-empty-state">
        <span>选择论文以编辑笔记</span>
      </section>
    )
  }

  return (
    <form className="reader-notes-panel" onSubmit={saveNotes}>
      <label className="library-control" htmlFor="reader-notes">
        <span>阅读笔记</span>
        <textarea id="reader-notes" onChange={(event) => setNotes(event.target.value)} value={notes} />
      </label>
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <button className="btn btn-secondary" disabled={isSaving} type="submit">
        保存笔记
      </button>
    </form>
  )
}
