export type SuggestionItemData = {
  id: string
  number: string // "01", "02", "03"
  category: string
  title: string
  reason: string
  actionLabel: string
}

type SuggestionItemProps = {
  item: SuggestionItemData
  onAction: (id: string) => void
}

const categoryStyles: Record<string, { badge: string; cardBg: string; border: string }> = {
  待优先阅读: {
    badge: 'bg-blue-500 text-white',
    cardBg: 'bg-[#F8FBFF]',
    border: 'border-blue-100',
  },
  研究趋势: {
    badge: 'bg-[#14B8A6] text-white',
    cardBg: 'bg-[#F0FDFA]',
    border: 'border-teal-100',
  },
  潜在风险: {
    badge: 'bg-[#F97316] text-white',
    cardBg: 'bg-[#FFF7ED]',
    border: 'border-orange-100',
  },
}

export function SuggestionItem({ item, onAction }: SuggestionItemProps) {
  const { id, number, category, title, reason, actionLabel } = item
  const style = categoryStyles[category] ?? categoryStyles['待优先阅读']

  return (
    <div className={`rounded-[12px] ${style.cardBg} border ${style.border} p-3.5 transition-all duration-200 hover:shadow-sm`}>
      <div className="flex items-start gap-3">
        {/* Number badge */}
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${style.badge}`}
        >
          {number}
        </span>

        {/* Content */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Category + Title row */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-medium ${style.badge}`}>
              {category}
            </span>
          </div>

          {/* Title */}
          <span className="mt-1.5 text-[13px] font-medium text-[#0F172A] leading-snug">
            {title}
          </span>

          {/* Reason */}
          <span className="mt-1 text-[11px] text-[#64748B] leading-relaxed line-clamp-2">
            {reason}
          </span>

          {/* Action button */}
          <button
            type="button"
            onClick={() => onAction(id)}
            className="mt-2 inline-flex w-fit items-center rounded-lg bg-white border border-[#E2E8F0] px-3 py-1.5 text-[11px] font-medium text-[#334155] shadow-sm transition-all duration-200 hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#F1F5F9]"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
