import { useEffect, useRef, useState } from 'react'

import type { Paper } from '../../types'
import { Icon } from '../UiIcon'
import { findDuplicateByTitle } from './libraryFilters'
import type { ImportConfirmPayload } from './libraryTypes'

type ImportConfirmDialogProps = {
  isSubmitting: boolean
  existingPapers: Paper[]
  onSubmit: (payload: ImportConfirmPayload) => Promise<boolean>
  onClose: () => void
}

function deriveTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.pdf$/i, '')
  return withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function resolvePdf(files: ArrayLike<File> | null): File | null {
  if (!files || files.length === 0) return null

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
      return file
    }
  }

  return null
}

export function ImportConfirmDialog({
  isSubmitting,
  existingPapers,
  onSubmit,
  onClose,
}: ImportConfirmDialogProps) {
  const [source, setSource] = useState('manual')
  const [title, setTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationMessage, setValidationMessage] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const duplicatePaper = findDuplicateByTitle(existingPapers, title)

  useEffect(() => {
    if (selectedFile) {
      titleInputRef.current?.focus()
    }
  }, [selectedFile])

  function handleFileSelect(files: ArrayLike<File> | null) {
    const pdf = resolvePdf(files)
    if (!pdf) {
      setValidationMessage('仅支持 PDF 文件。')
      return
    }

    setSelectedFile(pdf)
    setTitle((currentTitle) => currentTitle.trim() || deriveTitleFromFileName(pdf.name))
    setValidationMessage('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedFile) {
      setValidationMessage('请先选择 PDF 文件。')
      return
    }

    const confirmedTitle = title.trim()
    if (!confirmedTitle) {
      setValidationMessage('请先输入论文标题。')
      titleInputRef.current?.focus()
      return
    }

    const isSuccess = await onSubmit({
      source: source.trim() || 'manual',
      title: confirmedTitle,
      file: selectedFile,
    })

    if (isSuccess) {
      setSelectedFile(null)
      setTitle('')
      setValidationMessage('')
      onClose()
    }
  }

  return (
    <form
      aria-labelledby="import-confirm-title"
      className="import-confirm-dialog"
      onSubmit={handleSubmit}
      role="dialog"
    >
      <div className="import-confirm-header">
        <div>
          <p className="panel-chip">PDF 导入</p>
          <h2 id="import-confirm-title">确认导入论文</h2>
        </div>
        <button
          aria-label="取消导入"
          className="icon-button"
          disabled={isSubmitting}
          onClick={onClose}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>

      <div
        className={`upload-dropzone import-confirm-dropzone${isDragActive ? ' active' : ''}`}
        onDragLeave={() => setIsDragActive(false)}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragActive(true)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragActive(false)
          handleFileSelect(event.dataTransfer.files)
        }}
      >
        <Icon name="upload" className="import-confirm-upload-icon" />
        <div className="upload-dropzone-title">拖拽 PDF 到此处</div>
        <div className="upload-dropzone-subtitle">选择本地 PDF 文件并确认元数据。</div>

        <input
          ref={fileInputRef}
          accept=".pdf,application/pdf"
          aria-label="PDF 文件"
          className="visually-hidden"
          id="import-confirm-pdf-file"
          onChange={(event) => handleFileSelect(event.target.files)}
          type="file"
        />

        <button
          className="btn btn-ghost"
          disabled={isSubmitting}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          选择 PDF
        </button>

        {selectedFile && (
          <div className="upload-selected-file" title={selectedFile.name}>
            已选文件：{selectedFile.name}
          </div>
        )}
      </div>

      <div className="import-confirm-fields">
        <label className="form-group" htmlFor="import-confirm-title-input">
          <span>标题</span>
          <input
            ref={titleInputRef}
            disabled={isSubmitting}
            id="import-confirm-title-input"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>

        <label className="form-group" htmlFor="import-confirm-source-input">
          <span>来源</span>
          <input
            disabled={isSubmitting}
            id="import-confirm-source-input"
            onChange={(event) => setSource(event.target.value)}
            value={source}
          />
        </label>
      </div>

      {duplicatePaper && (
        <div className="feedback-banner feedback-error import-confirm-warning" role="status">
          <Icon name="warning" className="banner-icon" />
          <span>已存在相同标题的论文。</span>
        </div>
      )}

      {validationMessage && (
        <div className="feedback-banner feedback-error" role="alert">
          <Icon name="warning" className="banner-icon" />
          <span>{validationMessage}</span>
        </div>
      )}

      <div className="import-confirm-actions">
        <button className="btn btn-action" disabled={isSubmitting} onClick={onClose} type="button">
          取消
        </button>
        <button className="btn btn-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? (
            <>
              <span className="spinner" />
              导入中...
            </>
          ) : (
            '确认导入'
          )}
        </button>
      </div>
    </form>
  )
}
