import { FileText, Briefcase, Rss, AlertTriangle, type LucideIcon } from 'lucide-react'

export type KpiCardProps = {
  label: string
  value: number
  trend: string
  icon: string
  color: string // accent color for icon background
  onClick?: () => void
}

const iconMap: Record<string, LucideIcon> = {
  FileText,
  Briefcase,
  Rss,
  AlertTriangle,
}

// Softer gradient backgrounds for each icon color
const iconGradients: Record<string, string> = {
  '#4F46E5': 'from-indigo-50 to-violet-50',
  '#14B8A6': 'from-teal-50 to-emerald-50',
  '#2563EB': 'from-blue-50 to-sky-50',
  '#EF4444': 'from-red-50 to-rose-50',
}

export function KpiCard({ label, value, trend, icon, color, onClick }: KpiCardProps) {
  const IconComponent = iconMap[icon] ?? FileText
  const gradient = iconGradients[color] ?? 'from-slate-50 to-gray-50'
  const Element = onClick ? 'button' : 'div'

  return (
    <Element
      type={onClick ? 'button' : undefined}
      aria-label={onClick ? `查看${label}详情` : undefined}
      onClick={onClick}
      className={`relative flex w-full items-center justify-between rounded-[14px] border border-[#F1F5F9] bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#E2E8F0] ${onClick ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]' : ''}`}
      style={{ boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}
    >
      <div className="flex flex-col">
        <span className="text-[30px] font-bold leading-none text-[#0F172A] tracking-tight">{value}</span>
        <span className="mt-1 text-[13px] font-medium text-[#334155]">{label}</span>
        <span className="mt-0.5 text-[11px] text-[#94A3B8]">{trend}</span>
      </div>
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${gradient} ring-1 ring-inset ring-black/[0.03]`}
      >
        <IconComponent size={20} style={{ color }} strokeWidth={1.8} />
      </div>
    </Element>
  )
}
