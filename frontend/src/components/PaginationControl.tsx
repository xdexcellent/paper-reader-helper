import { ChevronLeft, ChevronRight } from 'lucide-react'

export type PaginationControlProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

/**
 * Computes the page numbers to display.
 * - When totalPages ≤ 7: show all page numbers
 * - When totalPages > 7: show first/last + current ± 1 + ellipsis
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = []

  // Always include first page
  pages.push(1)

  // Determine the range around current page
  const rangeStart = Math.max(2, currentPage - 1)
  const rangeEnd = Math.min(totalPages - 1, currentPage + 1)

  // Add ellipsis before range if needed
  if (rangeStart > 2) {
    pages.push('...')
  }

  // Add pages in range
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i)
  }

  // Add ellipsis after range if needed
  if (rangeEnd < totalPages - 1) {
    pages.push('...')
  }

  // Always include last page
  pages.push(totalPages)

  return pages
}

export function PaginationControl({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationControlProps): JSX.Element {
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  const isFirstPage = currentPage <= 1
  const isLastPage = currentPage >= totalPages

  return (
    <nav
      className="flex items-center justify-center gap-1 py-3"
      aria-label="分页导航"
    >
      {/* Previous button */}
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F1F5F9] bg-white text-[#64748B] transition-all duration-200 hover:border-[#E2E8F0] hover:text-[#2563EB] hover:-translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#F1F5F9] disabled:hover:text-[#64748B] disabled:hover:translate-y-0"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={isFirstPage}
        aria-label="上一页"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>

      {/* Page number indicators */}
      {pageNumbers.map((page, index) => {
        if (page === '...') {
          return (
            <span
              key={`ellipsis-${index}`}
              className="flex h-8 w-8 items-center justify-center text-[13px] text-[#64748B]"
              aria-hidden="true"
            >
              …
            </span>
          )
        }

        const isActive = page === currentPage
        return (
          <button
            key={page}
            type="button"
            className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-medium transition-all duration-200 ${
              isActive
                ? 'bg-[#2563EB] text-white shadow-sm'
                : 'border border-[#F1F5F9] bg-white text-[#64748B] hover:border-[#E2E8F0] hover:text-[#2563EB]'
            }`}
            onClick={() => onPageChange(page)}
            aria-label={`第 ${page} 页`}
            aria-current={isActive ? 'page' : undefined}
          >
            {page}
          </button>
        )
      })}

      {/* Next button */}
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F1F5F9] bg-white text-[#64748B] transition-all duration-200 hover:border-[#E2E8F0] hover:text-[#2563EB] hover:-translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#F1F5F9] disabled:hover:text-[#64748B] disabled:hover:translate-y-0"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={isLastPage}
        aria-label="下一页"
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>

      {/* Total page count */}
      <span className="ml-2 text-[12px] text-[#64748B]">
        共 {totalPages} 页
      </span>
    </nav>
  )
}
