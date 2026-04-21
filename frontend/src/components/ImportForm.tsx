import { useRef, useState } from 'react'

export function ImportForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (payload: { source: string; file: File }) => Promise<boolean>
  isSubmitting: boolean
}) {
  const [source, setSource] = useState('manual')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resolvePdf(files: ArrayLike<File> | null): File | null {
    if (!files || files.length === 0) return null
    for (let i = 0; i < files.length; i += 1) {
      const current = files[i] ?? null
      if (current && current.name.toLowerCase().endsWith('.pdf')) {
        return current
      }
    }
    return null
  }

  function handleFileSelect(files: ArrayLike<File> | null) {
    const pdf = resolvePdf(files)
    if (!pdf) {
      setValidationMessage('请上传 PDF 文件')
      return
    }
    setValidationMessage('')
    setSelectedFile(pdf)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFile) {
      setValidationMessage('请先选择 PDF 文件')
      return
    }
    const isSuccess = await onSubmit({ source, file: selectedFile })
    if (isSuccess) {
      setSelectedFile(null)
      setValidationMessage('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card import-form">
      <div className="form-title">
        导入论文
      </div>

      <div className="form-group">
        <label htmlFor="paper-source">来源</label>
        <input
          id="paper-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="例如：arxiv、手动..."
        />
      </div>

      <div
        className={`upload-dropzone${isDragActive ? ' active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragActive(true)
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragActive(false)
          handleFileSelect(event.dataTransfer.files)
        }}
      >
        <div className="upload-dropzone-title">拖拽 PDF 到这里</div>
        <div className="upload-dropzone-subtitle">或点击下方按钮从文件中选择</div>

        <input
          ref={fileInputRef}
          id="paper-pdf-file"
          data-testid="paper-pdf-file-input"
          aria-label="PDF 文件"
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={(event) => handleFileSelect(event.target.files)}
        />

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
        >
          选择 PDF 文件
        </button>

        {selectedFile && (
          <div className="upload-selected-file" title={selectedFile.name}>
            已选择文件：{selectedFile.name}
          </div>
        )}

        {validationMessage && <div className="upload-validation">{validationMessage}</div>}

        <div className="upload-note">论文标题将自动从 PDF 元数据或文件名提取</div>
      </div>

      <button
        type="submit"
        aria-label="导入"
        disabled={isSubmitting || selectedFile === null}
        className="btn btn-primary"
        id="import-submit-btn"
      >
        {isSubmitting ? (
          <>
            <span className="spinner" />
            导入中...
          </>
        ) : (
          <>
            <span>＋</span>
            导入论文
          </>
        )}
      </button>
    </form>
  )
}
