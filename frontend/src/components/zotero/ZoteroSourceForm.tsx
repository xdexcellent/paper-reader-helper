import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../UiIcon'
import { ZOTERO_PATH_SUGGESTIONS, detectOs, type ZoteroPathSuggestion } from './zoteroPaths'

interface Props {
  onScan: (path: string) => void
  loading: boolean
  error: string
  /** 受控输入值（可选）：外部可通过历史/建议直接写入路径 */
  valueOverride?: string
}

export function ZoteroSourceForm({ onScan, loading, error, valueOverride }: Props) {
  const [sourcePath, setSourcePath] = useState('')

  // 允许外部（历史/建议）填入路径
  useEffect(() => {
    if (valueOverride !== undefined && valueOverride !== sourcePath) {
      setSourcePath(valueOverride)
    }
    // 只在 override 变化时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueOverride])

  const detectedOs = useMemo(() => detectOs(), [])

  // 把检测到的 OS 放第一个，其他作为备选
  const suggestions = useMemo<ZoteroPathSuggestion[]>(() => {
    if (!detectedOs) return ZOTERO_PATH_SUGGESTIONS
    const primary = ZOTERO_PATH_SUGGESTIONS.find((s) => s.os === detectedOs)
    const rest = ZOTERO_PATH_SUGGESTIONS.filter((s) => s.os !== detectedOs)
    return primary ? [primary, ...rest] : ZOTERO_PATH_SUGGESTIONS
  }, [detectedOs])

  return (
    <div className="zotero-source-form-wrapper">
      <label className="zotero-source-label" htmlFor="zotero-source-path">
        <span className="zotero-source-label-title">
          <Icon name="file" /> Zotero 数据库路径
        </span>
        <span className="zotero-source-label-hint">
          通常名为 <code>zotero.sqlite</code>，可从 Zotero &gt; 设置 &gt; 高级 中查看。
        </span>
      </label>

      <div className="zotero-source-form">
        <input
          id="zotero-source-path"
          type="text"
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder="输入 zotero.sqlite 的完整路径"
          aria-label="Zotero 数据库路径"
          disabled={loading}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          disabled={loading || !sourcePath.trim()}
          onClick={() => onScan(sourcePath.trim())}
          aria-label="扫描 Zotero 数据库"
        >
          {loading ? (
            <>
              <Icon name="refresh" className="zotero-spin" />
              扫描中…
            </>
          ) : (
            <>
              <Icon name="search" />
              扫描
            </>
          )}
        </button>
      </div>

      <div className="zotero-source-suggestions" role="group" aria-label="常见默认路径">
        <span className="zotero-source-suggestions-label">常见路径</span>
        {suggestions.map((suggestion) => {
          const isPrimary = suggestion.os === detectedOs
          return (
            <button
              key={suggestion.os}
              type="button"
              className={`zotero-path-chip${isPrimary ? ' zotero-path-chip-primary' : ''}`}
              onClick={() => setSourcePath(suggestion.path)}
              disabled={loading}
              title={`填入 ${suggestion.label} 默认路径`}
            >
              <span className="zotero-path-chip-os">{suggestion.label}</span>
              <code className="zotero-path-chip-path">{suggestion.path}</code>
              {isPrimary && <span className="zotero-path-chip-badge">推荐</span>}
            </button>
          )
        })}
      </div>

      {error && (
        <div role="alert" className="zotero-source-error">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
