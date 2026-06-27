import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Icon } from '../UiIcon'
import { cn } from '../../lib/utils'
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
    <Card className="zotero-source-form rounded-lg border-border/70 bg-card shadow-sm">
      <CardHeader className="gap-1.5">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Icon name="file" className="size-4 text-blue-600" />
          Zotero 数据库路径
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          通常名为 <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">zotero.sqlite</code>，可从 Zotero &gt; 设置 &gt; 高级 中查看。
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            id="zotero-source-path"
            type="text"
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="输入 zotero.sqlite 的完整路径"
            aria-label="Zotero 数据库路径"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
            className="h-9 flex-1 rounded-lg bg-card font-mono text-sm shadow-sm"
          />
          <Button
            type="button"
            disabled={loading || !sourcePath.trim()}
            onClick={() => onScan(sourcePath.trim())}
            aria-label="扫描 Zotero 数据库"
            className="h-9 shrink-0 rounded-lg px-4 shadow-sm"
          >
            {loading ? (
              <>
                <Icon name="refresh" className="size-4 animate-spin" />
                扫描中…
              </>
            ) : (
              <>
                <Icon name="search" className="size-4" />
                扫描
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="常见默认路径">
          <span className="text-xs font-medium text-muted-foreground">常见路径</span>
          {suggestions.map((suggestion) => {
            const isPrimary = suggestion.os === detectedOs
            return (
              <button
                key={suggestion.os}
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-blue-500/50 hover:bg-blue-500/5 disabled:opacity-50',
                  isPrimary
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-border bg-card',
                )}
                onClick={() => setSourcePath(suggestion.path)}
                disabled={loading}
                title={`填入 ${suggestion.label} 默认路径`}
              >
                <span className="font-semibold text-muted-foreground">{suggestion.label}</span>
                <code className="max-w-[240px] truncate font-mono text-[0.68rem] text-muted-foreground">
                  {suggestion.path}
                </code>
                {isPrimary && (
                  <Badge className="h-4 rounded-full px-1.5 text-[0.6rem] font-medium tracking-wide">
                    推荐
                  </Badge>
                )}
              </button>
            )
          })}
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
            role="alert"
          >
            <Icon name="warning" className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
