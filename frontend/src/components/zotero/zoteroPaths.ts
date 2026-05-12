/**
 * Zotero 默认数据库路径建议（按操作系统）。
 *
 * 约定：仅提供常见位置供一键填入，最终是否存在由后端扫描时验证。
 * `~` 为用户家目录占位，用户需根据实际平台替换。
 */

export type ZoteroOs = 'windows' | 'mac' | 'linux'

export interface ZoteroPathSuggestion {
  os: ZoteroOs
  label: string
  /** 可选，使用 `%USERPROFILE%` / `~` 作为占位符 */
  path: string
}

export const ZOTERO_PATH_SUGGESTIONS: ZoteroPathSuggestion[] = [
  {
    os: 'windows',
    label: 'Windows',
    path: '%USERPROFILE%\\Zotero\\zotero.sqlite',
  },
  {
    os: 'mac',
    label: 'macOS',
    path: '~/Zotero/zotero.sqlite',
  },
  {
    os: 'linux',
    label: 'Linux',
    path: '~/Zotero/zotero.sqlite',
  },
]

/**
 * 基于 UA / platform 尽力嗅探当前操作系统。
 * SSR / 非浏览器环境返回 null。
 */
export function detectOs(): ZoteroOs | null {
  if (typeof navigator === 'undefined') return null
  const platform = (navigator.platform || '').toLowerCase()
  const ua = (navigator.userAgent || '').toLowerCase()
  const hint = platform || ua
  if (hint.includes('win')) return 'windows'
  if (hint.includes('mac') || hint.includes('iphone') || hint.includes('ipad')) return 'mac'
  if (hint.includes('linux') || hint.includes('x11')) return 'linux'
  return null
}
