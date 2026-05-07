import { useState } from 'react'

interface Props {
  onScan: (path: string) => void
  loading: boolean
  error: string
}

export function ZoteroSourceForm({ onScan, loading, error }: Props) {
  const [sourcePath, setSourcePath] = useState('')

  return (
    <div>
      <div className="zotero-source-form">
        <input
          type="text"
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder="输入 zotero.sqlite 的完整路径"
          aria-label="Zotero 数据库路径"
          disabled={loading}
        />
        <button
          type="button"
          disabled={loading || !sourcePath.trim()}
          onClick={() => onScan(sourcePath.trim())}
          aria-label="扫描 Zotero 数据库"
        >
          {loading ? '扫描中...' : '扫描'}
        </button>
      </div>
      {error && (
        <div role="alert" style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          {error}
        </div>
      )}
    </div>
  )
}
