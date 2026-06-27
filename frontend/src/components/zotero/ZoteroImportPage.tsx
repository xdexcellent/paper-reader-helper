import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { ZoteroRunResponse, ZoteroCandidateResponse } from '../../types'
import {
  scanZotero,
  fetchZoteroCandidates,
  updateCandidateSelection,
  importZoteroCandidates,
  fetchSourceDist,
} from '../../lib/api'
import { filterCandidates } from './zoteroUtils'
import { ZoteroSourceForm } from './ZoteroSourceForm'
import { ZoteroCandidateTable } from './ZoteroCandidateTable'
import { ZoteroImportSummary } from './ZoteroImportSummary'
import { ZoteroStepBar, type ZoteroStep } from './ZoteroStepBar'
import { ZoteroEmptyState } from './ZoteroEmptyState'
import { ZoteroHistoryPanel } from './ZoteroHistoryPanel'
import { ZoteroMiniStats } from './ZoteroMiniStats'
import {
  loadZoteroHistory,
  recordScan,
  recordImport,
  clearZoteroHistory,
  type ZoteroHistoryEntry,
} from './zoteroHistory'

const selectClassName =
  'h-8 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50'

export function ZoteroImportPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [run, setRun] = useState<ZoteroRunResponse | null>(null)
  const [candidates, setCandidates] = useState<ZoteroCandidateResponse[]>([])
  const [importing, setImporting] = useState(false)
  const [allowMetadataOnly, setAllowMetadataOnly] = useState(false)
  const [sourcePath, setSourcePath] = useState('')
  const [formOverride, setFormOverride] = useState<string | undefined>(undefined)

  // 历史与顶部统计
  const [history, setHistory] = useState<ZoteroHistoryEntry[]>([])
  const [zoteroPaperCount, setZoteroPaperCount] = useState<number>(-1)

  // Filter state
  const [filterCollection, setFilterCollection] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterAttachmentStatus, setFilterAttachmentStatus] = useState('')
  const [filterDuplicateStatus, setFilterDuplicateStatus] = useState('')
  const [filterWarningStatus, setFilterWarningStatus] = useState('')

  useEffect(() => {
    setHistory(loadZoteroHistory())
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchSourceDist()
      .then((items) => {
        if (cancelled) return
        const zoteroItem = items.find((item) => item.source === 'zotero')
        setZoteroPaperCount(zoteroItem?.count ?? 0)
      })
      .catch(() => {
        if (!cancelled) setZoteroPaperCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [run?.imported_count])

  async function handleScan(path: string) {
    setLoading(true)
    setError('')
    setRun(null)
    setCandidates([])
    setSourcePath(path)
    try {
      const result = await scanZotero(path)
      setRun(result)
      const cands = await fetchZoteroCandidates(result.id)
      setCandidates(cands)
      setHistory(recordScan(result, path, cands.length))
    } catch (err) {
      setError(err instanceof Error ? err.message : '扫描失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectionChange(candidateId: number, selected: boolean) {
    if (!run) return
    try {
      const updated = await updateCandidateSelection(run.id, candidateId, selected)
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? updated : c)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新选择失败')
    }
  }

  async function handleImport() {
    if (!run) return
    setImporting(true)
    setError('')
    try {
      const result = await importZoteroCandidates(run.id, {
        allow_metadata_only: allowMetadataOnly,
      })
      setRun(result)
      setHistory(recordImport(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  function handleReplayHistory(path: string) {
    setFormOverride(path)
    // 允许同一路径被多次"重新扫描"
    handleScan(path)
  }

  function handleClearHistory() {
    clearZoteroHistory()
    setHistory([])
  }

  const filteredCandidates = filterCandidates(candidates, {
    collection: filterCollection || undefined,
    tag: filterTag || undefined,
    attachment_status: filterAttachmentStatus || undefined,
    duplicate_status: filterDuplicateStatus || undefined,
    warning_status: filterWarningStatus || undefined,
  })

  const allCollections = [...new Set(candidates.flatMap((c) => c.mapped_collections))]
  const allTags = [...new Set(candidates.flatMap((c) => c.mapped_tags))]
  const selectedCount = candidates.filter((c) => c.is_selected).length
  const hasImportResult =
    run !== null && run.imported_count + run.skipped_count + run.failed_count > 0

  // 推导当前步骤
  let currentStep: ZoteroStep = 'source'
  const completedSteps: ZoteroStep[] = []
  if (candidates.length > 0) {
    currentStep = hasImportResult ? 'confirm' : 'review'
    completedSteps.push('source')
    if (hasImportResult) completedSteps.push('review')
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4"
      data-testid="zotero-import-page"
    >
      <ZoteroMiniStats zoteroPaperCount={zoteroPaperCount} history={history} />

      <ZoteroStepBar current={currentStep} completed={completedSteps} />

      <ZoteroSourceForm
        onScan={handleScan}
        loading={loading}
        error={error}
        valueOverride={formOverride}
      />

      {candidates.length === 0 && !loading && !error && <ZoteroEmptyState />}

      {candidates.length === 0 && !loading && (
        <ZoteroHistoryPanel
          entries={history}
          onReplay={handleReplayHistory}
          onClear={handleClearHistory}
        />
      )}

      {candidates.length > 0 && (
        <>
          <Card className="zotero-filter-bar rounded-lg border-border/70 bg-card shadow-sm">
            <CardHeader className="border-b border-border/70 pb-3">
              <CardTitle className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
                <span>候选筛选</span>
                <Badge variant="secondary" className="h-5 rounded-md px-2 text-[0.7rem] font-medium text-muted-foreground">
                  共 {candidates.length} 候选 · {filteredCandidates.length} 显示 · {selectedCount} 已选
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div
                className="flex flex-wrap items-center gap-2"
                role="search"
                aria-label="候选过滤"
              >
                <select
                  value={filterCollection}
                  onChange={(e) => setFilterCollection(e.target.value)}
                  aria-label="按分类过滤"
                  className={selectClassName}
                >
                  <option value="">所有分类</option>
                  {allCollections.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  aria-label="按标签过滤"
                  className={selectClassName}
                >
                  <option value="">所有标签</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={filterAttachmentStatus}
                  onChange={(e) => setFilterAttachmentStatus(e.target.value)}
                  aria-label="按附件状态过滤"
                  className={selectClassName}
                >
                  <option value="">全部附件状态</option>
                  <option value="with_attachment">有附件</option>
                  <option value="without_attachment">仅元数据</option>
                </select>
                <select
                  value={filterDuplicateStatus}
                  onChange={(e) => setFilterDuplicateStatus(e.target.value)}
                  aria-label="按重复状态过滤"
                  className={selectClassName}
                >
                  <option value="">全部</option>
                  <option value="unique">不重复</option>
                  <option value="duplicate">重复</option>
                </select>
                <select
                  value={filterWarningStatus}
                  onChange={(e) => setFilterWarningStatus(e.target.value)}
                  aria-label="按警告状态过滤"
                  className={selectClassName}
                >
                  <option value="">全部警告状态</option>
                  <option value="no_warning">无警告</option>
                  <option value="warning">有警告</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <ZoteroCandidateTable
            candidates={filteredCandidates}
            onSelectionChange={handleSelectionChange}
          />

          <Card className="zotero-import-confirm rounded-lg border-border/70 bg-card shadow-sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allowMetadataOnly}
                  onChange={(e) => setAllowMetadataOnly(e.target.checked)}
                  aria-label="允许仅导入元数据"
                  className="size-4 cursor-pointer rounded border-border"
                />
                允许导入仅有元数据的论文（无PDF附件）
              </label>
              <Button
                type="button"
                disabled={importing || selectedCount === 0}
                onClick={handleImport}
                aria-label="确认导入选中的候选"
                className="h-9 rounded-lg bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700"
              >
                {importing ? '导入中...' : `确认导入 (${selectedCount})`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {hasImportResult && run && <ZoteroImportSummary run={run} />}

      {/* 保留 sourcePath 以便 run 结束后展示「刚刚扫描了什么」 */}
      {sourcePath && run && candidates.length > 0 && (
        <p className="text-xs text-muted-foreground" aria-hidden="true">
          已扫描：<code className="rounded bg-muted px-1 py-0.5 font-mono">{sourcePath}</code>
        </p>
      )}
    </div>
  )
}
