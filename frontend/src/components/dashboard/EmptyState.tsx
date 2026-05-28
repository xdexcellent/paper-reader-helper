import { FileText, Inbox } from 'lucide-react'

type EmptyStateProps = {
  icon?: 'papers' | 'inbox'
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon = 'papers', title, description, action }: EmptyStateProps) {
  const IconComponent = icon === 'inbox' ? Inbox : FileText

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] mb-4">
        <IconComponent size={24} className="text-[#CBD5E1]" />
      </div>
      <h3 className="text-[14px] font-medium text-[#334155] mb-1">{title}</h3>
      {description && (
        <p className="text-[12px] text-[#94A3B8] text-center max-w-[280px]">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
