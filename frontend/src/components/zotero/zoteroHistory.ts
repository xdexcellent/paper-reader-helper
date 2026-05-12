/**
 * Zotero 导入历史（本地存储）。
 *
 * 仅保留最近若干条扫描/导入概要，用于导入页面的历史面板。
 * 后端暂未提供 list-runs 接口，先用 localStorage 做轻量缓存。
 */

import type { ZoteroRunResponse } from '../../types'

const STORAGE_KEY = 'zotero_import_history_v1'
const MAX_ENTRIES = 5

export interface ZoteroHistoryEntry {
  run_id: number
  source_path: string
  scanned_at: string
  candidate_count: number
  imported_count: number
  skipped_count: number
  failed_count: number
}

function readStorage(): ZoteroHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as ZoteroHistoryEntry[]
  } catch {
    return []
  }
}

function writeStorage(entries: ZoteroHistoryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // 忽略 quota exceeded 等非致命错误
  }
}

export function loadZoteroHistory(): ZoteroHistoryEntry[] {
  return readStorage()
}

/** 记录一次扫描：无相同 run_id 时新增，否则更新已有条目并置顶 */
export function recordScan(run: ZoteroRunResponse, sourcePath: string, candidateCount: number): ZoteroHistoryEntry[] {
  const existing = readStorage().filter((e) => e.run_id !== run.id)
  const entry: ZoteroHistoryEntry = {
    run_id: run.id,
    source_path: sourcePath,
    scanned_at: run.created_at || new Date().toISOString(),
    candidate_count: candidateCount,
    imported_count: run.imported_count,
    skipped_count: run.skipped_count,
    failed_count: run.failed_count,
  }
  const updated = [entry, ...existing].slice(0, MAX_ENTRIES)
  writeStorage(updated)
  return updated
}

/** 导入完成后刷新对应条目的计数 */
export function recordImport(run: ZoteroRunResponse): ZoteroHistoryEntry[] {
  const entries = readStorage()
  const idx = entries.findIndex((e) => e.run_id === run.id)
  if (idx === -1) return entries
  entries[idx] = {
    ...entries[idx],
    imported_count: run.imported_count,
    skipped_count: run.skipped_count,
    failed_count: run.failed_count,
  }
  writeStorage(entries)
  return entries
}

export function clearZoteroHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
