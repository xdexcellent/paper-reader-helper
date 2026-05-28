import { SuggestionItem, type SuggestionItemData } from './SuggestionItem'

export type SuggestionsPanelProps = {
  suggestions: SuggestionItemData[]
  totalCount: number
  onAction: (id: string) => void
}

export function SuggestionsPanel({ suggestions, totalCount, onAction }: SuggestionsPanelProps) {
  return (
    <div
      className="rounded-[16px] bg-white p-5"
      style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.04)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-[15px] font-semibold text-[#0F172A]">关键建议</h3>
        <a
          href="#"
          className="text-[11px] text-[#2563EB] hover:underline"
          onClick={(e) => e.preventDefault()}
        >
          查看全部（{totalCount}）
        </a>
      </div>

      {/* Suggestion items as individual cards */}
      <div className="flex flex-col gap-2.5">
        {suggestions.map((suggestion, index) => (
          <SuggestionItem
            key={suggestion.id}
            item={{
              ...suggestion,
              number: String(index + 1).padStart(2, '0'),
            }}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  )
}
