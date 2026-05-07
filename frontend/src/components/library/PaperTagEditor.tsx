import { useEffect, useState, type KeyboardEvent } from 'react'

import { Icon } from '../UiIcon'

type PaperTagEditorProps = {
  tags: string[]
  onTagsChange?: (tags: string[]) => Promise<void> | void
}

export function PaperTagEditor({ tags: initialTags, onTagsChange }: PaperTagEditorProps) {
  const [tags, setTags] = useState(initialTags)
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setTags(initialTags)
    setIsAddingTag(false)
    setNewTag('')
  }, [initialTags])

  async function commitTags(nextTags: string[]) {
    setTags(nextTags)
    await onTagsChange?.(nextTags)
  }

  async function addTag() {
    const trimmed = newTag.trim()
    if (!trimmed || tags.includes(trimmed)) {
      setIsAddingTag(false)
      setNewTag('')
      return
    }

    await commitTags([...tags, trimmed])
    setIsAddingTag(false)
    setNewTag('')
  }

  function handleNewTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void addTag()
    }
    if (event.key === 'Escape') {
      setIsAddingTag(false)
      setNewTag('')
    }
  }

  return (
    <div className="paper-tag-editor" aria-label="Paper tags">
      {tags.map((tag) => (
        <span className="tag-editor-pill" key={tag}>
          {tag}
          <button
            aria-label={`Remove tag ${tag}`}
            className="tag-editor-remove"
            onClick={() => void commitTags(tags.filter((currentTag) => currentTag !== tag))}
            type="button"
          >
            <Icon name="close" />
          </button>
        </span>
      ))}
      {isAddingTag ? (
        <label className="tag-editor-field" htmlFor="paper-new-tag">
          <span>New tag</span>
          <input
            autoFocus
            id="paper-new-tag"
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={handleNewTagKeyDown}
            value={newTag}
          />
        </label>
      ) : (
        <button className="tag-editor-add" onClick={() => setIsAddingTag(true)} type="button">
          Add tag
        </button>
      )}
    </div>
  )
}
