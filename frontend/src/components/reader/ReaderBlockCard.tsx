import type { ReactNode } from 'react'

import type { PaperBlock } from '../../types'
import { Icon } from '../UiIcon'
import {
  createPdfPageHref,
  formatBlockPageLabel,
  getBlockTypeLabel,
  truncateBlockText,
} from './readerBlockUtils'

type ReaderBlockCardProps = {
  block: PaperBlock
  isSelected: boolean
  children?: ReactNode
  onOpenPage: (block: PaperBlock) => void
  onSelect: (block: PaperBlock) => void
}

export function ReaderBlockCard({
  block,
  isSelected,
  children,
  onOpenPage,
  onSelect,
}: ReaderBlockCardProps) {
  const blockNumber = block.block_index + 1
  const pageLabel = formatBlockPageLabel(block.page_index)
  const hasPage = typeof block.page_index === 'number'

  return (
    <article className="reader-block-card" data-selected={isSelected ? 'true' : undefined}>
      <header className="reader-block-card-header">
        <div className="reader-block-meta">
          <span className="reader-block-type">{getBlockTypeLabel(block.block_type)}</span>
          <a className="reader-block-page" href={createPdfPageHref(block.page_index)}>
            {pageLabel}
          </a>
          <span className="reader-block-order">Block {blockNumber}</span>
        </div>
        <div className="reader-block-actions">
          <button
            aria-label={`Select block ${blockNumber}`}
            className="btn btn-secondary"
            onClick={() => onSelect(block)}
            type="button"
          >
            <Icon name="target" />
            Select
          </button>
          <button
            className="btn btn-secondary"
            disabled={!hasPage}
            onClick={() => onOpenPage(block)}
            type="button"
          >
            <Icon name="pdf" />
            Open {pageLabel}
          </button>
        </div>
      </header>
      <p className="reader-block-text">{truncateBlockText(block.text)}</p>
      {children}
    </article>
  )
}
