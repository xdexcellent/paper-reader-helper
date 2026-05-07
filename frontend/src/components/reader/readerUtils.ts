import type { ReaderHeading } from './readerTypes'

function cleanHeadingText(value: string): string {
  return value.replace(/\s+#+\s*$/, '').trim()
}

export function createHeadingId(text: string, usedIds: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()+.!?:;"']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section'
  const count = (usedIds.get(base) ?? 0) + 1
  usedIds.set(base, count)
  return count === 1 ? base : `${base}-${count}`
}

export function extractMarkdownHeadings(markdown: string): ReaderHeading[] {
  const usedIds = new Map<string, number>()
  return markdown.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match) return []
    const text = cleanHeadingText(match[2])
    if (!text) return []
    return [{ id: createHeadingId(text, usedIds), level: match[1].length, text }]
  })
}

export function hasMarkdownContent(markdown: string | null | undefined): boolean {
  return Boolean(markdown?.trim())
}
