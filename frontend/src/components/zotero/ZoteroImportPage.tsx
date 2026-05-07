import { useState } from 'react'
import type { ZoteroRunResponse, ZoteroCandidateResponse } from '../../types'
import {
  scanZotero,
  fetchZoteroCandidates,
  updateCandidateSelection,
  importZoteroCandidates,
} from '../../lib/api'
import { filterCandidates } from './zoteroUtils'
import { ZoteroSourceForm } from './ZoteroSourceForm'
import { ZoteroCandidateTable } from './ZoteroCandidateTable'
import { ZoteroImportSummary } from './ZoteroImportSummary'

export function ZoteroImportPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [run, setRun] = useState<ZoteroRunResponse | null>(null)
  const [candidates, setCandidates] = useState<ZoteroCandidateResponse[]>([])
  const [importing, setImporting] = useState(false)
  const [allowMetadataOnly, setAllowMetadataOnly] = useState(false)

  // Filter state
  const [filterCollection, setFilterCollection] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterAttachmentStatus, setFilterAttachmentStatus] = useState('')
  const [filterDuplicateStatus, setFilterDuplicateStatus] = useState('')
  const [filterWarningStatus, setFilterWarningStatus] = useState('')

  async function handleScan(sourcePath: string) {
    setLoading(true)
    setError('')
    setRun(null)
    setCandidates([])
    try {
      const result = await scanZotero(sourcePath)
      setRun(result)
      const cands = await fetchZoteroCandidates(result.id)
      setCandidates(cands)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
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

  return (
    <div className="zotero-import-page" data-testid="zotero-import-page">
      <ZoteroSourceForm onScan={handleScan} loading={loading} error={error} />

      {candidates.length > 0 && (
        <>
          <div className="zotero-filter-bar" role="search" aria-label="候选过滤">
            <select
              value={filterCollection}
              onChange={(e) => setFilterCollection(e.target.value)}
              aria-label="按分类过滤"
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
            >
              <option value="">全部附件状态</option>
              <option value="with_attachment">有附件</option>
              <option value="without_attachment">仅元数据</option>
            </select>
            <select
              value={filterDuplicateStatus}
              onChange={(e) => setFilterDuplicateStatus(e.target.value)}
              aria-label="按重复状态过滤"
            >
              <option value="">全部</option>
              <option value="unique">不重复</option>
              <option value="duplicate">重复</option>
            </select>
            <select
              value={filterWarningStatus}
              onChange={(e) => setFilterWarningStatus(e.target.value)}
              aria-label="按警告状态过滤"
            >
              <option value="">全部警告状态</option>
              <option value="no_warning">无警告</option>
              <option value="warning">有警告</option>
            </select>
            <span style={{ fontSize: '0.8rem', marginLeft: 'auto', alignSelf: 'center' }}>
              共 {candidates.length} 候选，{filteredCandidates.length} 显示，{selectedCount} 已选
            </span>
          </div>

          <ZoteroCandidateTable
            candidates={filteredCandidates}
            onSelectionChange={handleSelectionChange}
          />

          <div className="zotero-import-confirm">
            <label>
              <input
                type="checkbox"
                checked={allowMetadataOnly}
                onChange={(e) => setAllowMetadataOnly(e.target.checked)}
                aria-label="允许仅导入元数据"
              />
              {' '}允许导入仅有元数据的论文（无PDF附件）
            </label>
            <button
              type="button"
              disabled={importing || selectedCount === 0}
              onClick={handleImport}
              aria-label="确认导入选中的候选"
            >
              {importing ? '导入中...' : `确认导入 (${selectedCount})`}
            </button>
          </div>
        </>
      )}

      {run && run.imported_count + run.skipped_count + run.failed_count > 0 && (
        <ZoteroImportSummary run={run} />
      )}
    </div>
  )
}
