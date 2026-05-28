/**
 * PaperThumbnail — renders a realistic paper preview thumbnail using CSS/SVG.
 * Variant is determined by paper index or source type.
 * Size is controlled by the caller via className.
 */

type PaperThumbnailProps = {
  variant: number
  className?: string
  paperId?: number | string
  thumbnailUrl?: string
  title?: string
  abstractText?: string
}

function parsePaperId(paperId?: number | string): number | null {
  if (typeof paperId === 'number') return Number.isFinite(paperId) && paperId > 0 ? paperId : null
  if (!paperId) return null
  const numericId = parseInt(paperId, 10)
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null
}

function isPdfLikeUrl(url: string): boolean {
  return url.startsWith('blob:') || /\.pdf(?:$|[?#])/i.test(url) || /\/pdf(?:$|[?#])/i.test(url)
}

function compactText(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

const pageAccents = ['#4F46E5', '#0EA5E9', '#14B8A6', '#7C3AED', '#EC4899', '#0284C7', '#16A34A']

function PdfFirstPagePreview({
  variant,
  title,
  abstractText,
  hasPdfSource,
}: {
  variant: number
  title?: string
  abstractText?: string
  hasPdfSource: boolean
}) {
  const accent = pageAccents[((variant - 1) % pageAccents.length)]
  const titlePreview = clipText(compactText(title) || 'Untitled paper', 58)
  const abstractPreview = clipText(compactText(abstractText) || 'Abstract preview is not available yet.', 104)

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_25%_18%,#DBEAFE_0,#F8FAFC_38%,#EEF2FF_100%)] px-[7px] py-[5px]">
      <div className="absolute right-[5px] bottom-[5px] h-[84%] w-[78%] rotate-[3deg] rounded-[4px] bg-[#CBD5E1]/55 blur-[0.2px]" />
      <div className="relative h-[calc(100%-6px)] w-[82%] overflow-hidden rounded-[5px] border border-[#CBD5E1] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.18)]">
        <div className="h-[3px] w-full" style={{ background: accent }} />
        <div className="px-[5px] pt-[5px]">
          <div className="mb-[4px] flex items-center justify-between gap-[3px]">
            <span className="h-[2px] w-[18px] rounded-full bg-[#CBD5E1]" />
            {hasPdfSource && (
              <span className="rounded-[3px] bg-[#EFF6FF] px-[3px] py-[0.5px] text-[4.2px] font-bold tracking-[0.12em] text-[#2563EB]">
                PDF
              </span>
            )}
          </div>
          <div className="line-clamp-3 text-[6.4px] font-bold leading-[7.6px] text-[#0F172A]">
            {titlePreview}
          </div>
          <div className="mt-[4px] space-y-[1.5px]">
            <span className="block h-[2px] w-[76%] rounded-full bg-[#E2E8F0]" />
            <span className="block h-[2px] w-[52%] rounded-full bg-[#E2E8F0]" />
          </div>
          <div className="mt-[5px] flex items-center gap-[3px] text-[4.2px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
            <span>Abstract</span>
            <span className="h-px flex-1 bg-[#E2E8F0]" />
          </div>
          <div className="mt-[2px] line-clamp-4 text-[4.7px] leading-[5.9px] text-[#475569]">
            {abstractPreview}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[22px] bg-gradient-to-t from-white via-white/90 to-transparent" />
      </div>
    </div>
  )
}

function Variant1() {
  // Model architecture / Transformer blocks
  return (
    <svg viewBox="0 0 112 72" fill="none" className="w-full h-full">
      <rect width="112" height="72" rx="0" fill="#F0F4FF"/>
      <rect x="8" y="6" width="96" height="4" rx="2" fill="#C7D2FE" opacity="0.7"/>
      <rect x="8" y="13" width="72" height="3" rx="1.5" fill="#E0E7FF"/>
      <rect x="8" y="18" width="84" height="3" rx="1.5" fill="#E0E7FF"/>
      {/* Architecture blocks */}
      <rect x="16" y="28" width="22" height="14" rx="3" fill="#818CF8" opacity="0.5"/>
      <rect x="44" y="28" width="22" height="14" rx="3" fill="#6366F1" opacity="0.4"/>
      <rect x="72" y="28" width="22" height="14" rx="3" fill="#818CF8" opacity="0.3"/>
      <path d="M38 35 L44 35" stroke="#6366F1" strokeWidth="1.5" opacity="0.5"/>
      <path d="M66 35 L72 35" stroke="#6366F1" strokeWidth="1.5" opacity="0.5"/>
      <rect x="30" y="48" width="52" height="12" rx="3" fill="#A5B4FC" opacity="0.3"/>
      <path d="M38 42 L56 48" stroke="#6366F1" strokeWidth="1" opacity="0.4"/>
      <path d="M66 42 L56 48" stroke="#6366F1" strokeWidth="1" opacity="0.4"/>
      <rect x="8" y="64" width="60" height="2.5" rx="1" fill="#E0E7FF"/>
    </svg>
  )
}

function Variant2() {
  // Knowledge graph / network nodes
  return (
    <svg viewBox="0 0 112 72" fill="none" className="w-full h-full">
      <rect width="112" height="72" rx="0" fill="#ECFDF5"/>
      <rect x="8" y="6" width="96" height="4" rx="2" fill="#A7F3D0" opacity="0.7"/>
      <rect x="8" y="13" width="72" height="3" rx="1.5" fill="#D1FAE5"/>
      <circle cx="32" cy="36" r="7" fill="#10B981" opacity="0.6"/>
      <circle cx="56" cy="28" r="5.5" fill="#34D399" opacity="0.5"/>
      <circle cx="80" cy="38" r="6" fill="#10B981" opacity="0.4"/>
      <circle cx="44" cy="52" r="4.5" fill="#6EE7B7" opacity="0.6"/>
      <circle cx="72" cy="54" r="4" fill="#34D399" opacity="0.5"/>
      <line x1="32" y1="36" x2="56" y2="28" stroke="#10B981" strokeWidth="1.2" opacity="0.35"/>
      <line x1="56" y1="28" x2="80" y2="38" stroke="#10B981" strokeWidth="1.2" opacity="0.35"/>
      <line x1="32" y1="36" x2="44" y2="52" stroke="#10B981" strokeWidth="1.2" opacity="0.35"/>
      <line x1="80" y1="38" x2="72" y2="54" stroke="#10B981" strokeWidth="1.2" opacity="0.35"/>
      <line x1="44" y1="52" x2="72" y2="54" stroke="#10B981" strokeWidth="1" opacity="0.25"/>
      <rect x="8" y="64" width="60" height="2.5" rx="1" fill="#D1FAE5"/>
    </svg>
  )
}

function Variant3() {
  // Performance curves / line chart
  return (
    <svg viewBox="0 0 112 72" fill="none" className="w-full h-full">
      <rect width="112" height="72" rx="0" fill="#FFFBEB"/>
      <rect x="8" y="6" width="96" height="4" rx="2" fill="#FDE68A" opacity="0.7"/>
      <rect x="8" y="13" width="72" height="3" rx="1.5" fill="#FEF3C7"/>
      {/* Chart axes */}
      <line x1="16" y1="58" x2="100" y2="58" stroke="#D97706" strokeWidth="0.7" opacity="0.3"/>
      <line x1="16" y1="24" x2="16" y2="58" stroke="#D97706" strokeWidth="0.7" opacity="0.3"/>
      {/* Curve */}
      <path d="M18 54 Q30 50 42 44 Q54 38 66 32 Q78 27 90 25 Q96 24 100 24" stroke="#F59E0B" strokeWidth="2" fill="none" opacity="0.8"/>
      <path d="M18 54 Q30 50 42 44 Q54 38 66 32 Q78 27 90 25 Q96 24 100 24 L100 58 L18 58 Z" fill="#F59E0B" opacity="0.06"/>
      {/* Second curve */}
      <path d="M18 56 Q30 54 42 50 Q54 46 66 40 Q78 36 90 34 Q96 33 100 32" stroke="#D97706" strokeWidth="1.2" fill="none" opacity="0.4" strokeDasharray="3 2"/>
      <rect x="8" y="64" width="60" height="2.5" rx="1" fill="#FEF3C7"/>
    </svg>
  )
}

function Variant4() {
  // GNN / graph structure with boxes
  return (
    <svg viewBox="0 0 112 72" fill="none" className="w-full h-full">
      <rect width="112" height="72" rx="0" fill="#F5F3FF"/>
      <rect x="8" y="6" width="96" height="4" rx="2" fill="#DDD6FE" opacity="0.7"/>
      <rect x="8" y="13" width="72" height="3" rx="1.5" fill="#EDE9FE"/>
      <rect x="20" y="26" width="16" height="12" rx="3" fill="#7C3AED" opacity="0.5"/>
      <rect x="48" y="22" width="16" height="12" rx="3" fill="#8B5CF6" opacity="0.4"/>
      <rect x="76" y="28" width="16" height="12" rx="3" fill="#7C3AED" opacity="0.5"/>
      <rect x="34" y="46" width="14" height="10" rx="2.5" fill="#A78BFA" opacity="0.4"/>
      <rect x="62" y="48" width="14" height="10" rx="2.5" fill="#A78BFA" opacity="0.35"/>
      <line x1="36" y1="32" x2="48" y2="28" stroke="#7C3AED" strokeWidth="1" opacity="0.35"/>
      <line x1="64" y1="28" x2="76" y2="34" stroke="#7C3AED" strokeWidth="1" opacity="0.35"/>
      <line x1="28" y1="38" x2="41" y2="46" stroke="#7C3AED" strokeWidth="1" opacity="0.3"/>
      <line x1="56" y1="34" x2="69" y2="48" stroke="#7C3AED" strokeWidth="1" opacity="0.3"/>
      <rect x="8" y="64" width="60" height="2.5" rx="1" fill="#EDE9FE"/>
    </svg>
  )
}

function Variant5() {
  // Table / survey comparison
  return (
    <svg viewBox="0 0 112 72" fill="none" className="w-full h-full">
      <rect width="112" height="72" rx="0" fill="#FDF2F8"/>
      <rect x="8" y="6" width="96" height="4" rx="2" fill="#FBCFE8" opacity="0.7"/>
      <rect x="8" y="13" width="72" height="3" rx="1.5" fill="#FCE7F3"/>
      {/* Table */}
      <rect x="12" y="22" width="88" height="8" rx="2" fill="#EC4899" opacity="0.12"/>
      <rect x="12" y="32" width="88" height="7" rx="1" fill="#FCE7F3" opacity="0.6"/>
      <rect x="12" y="41" width="88" height="7" rx="1" fill="#FDF2F8"/>
      <rect x="12" y="50" width="88" height="7" rx="1" fill="#FCE7F3" opacity="0.6"/>
      <line x1="44" y1="22" x2="44" y2="57" stroke="#F9A8D4" strokeWidth="0.5" opacity="0.5"/>
      <line x1="72" y1="22" x2="72" y2="57" stroke="#F9A8D4" strokeWidth="0.5" opacity="0.5"/>
      <rect x="8" y="64" width="60" height="2.5" rx="1" fill="#FCE7F3"/>
    </svg>
  )
}

function Variant6() {
  // Bilingual / translation layout
  return (
    <svg viewBox="0 0 112 72" fill="none" className="w-full h-full">
      <rect width="112" height="72" rx="0" fill="#F0F9FF"/>
      <rect x="8" y="6" width="96" height="4" rx="2" fill="#BAE6FD" opacity="0.7"/>
      <rect x="8" y="13" width="72" height="3" rx="1.5" fill="#E0F2FE"/>
      <rect x="12" y="22" width="38" height="36" rx="4" fill="#0EA5E9" opacity="0.06"/>
      <rect x="62" y="22" width="38" height="36" rx="4" fill="#0EA5E9" opacity="0.06"/>
      <rect x="16" y="28" width="28" height="2.5" rx="1" fill="#BAE6FD"/>
      <rect x="16" y="33" width="24" height="2.5" rx="1" fill="#BAE6FD"/>
      <rect x="16" y="38" width="30" height="2.5" rx="1" fill="#BAE6FD"/>
      <rect x="66" y="28" width="28" height="2.5" rx="1" fill="#BAE6FD"/>
      <rect x="66" y="33" width="24" height="2.5" rx="1" fill="#BAE6FD"/>
      <rect x="66" y="38" width="30" height="2.5" rx="1" fill="#BAE6FD"/>
      <path d="M52 38 L56 40 L52 42" stroke="#0EA5E9" strokeWidth="1.5" fill="none" opacity="0.5"/>
      <rect x="8" y="64" width="60" height="2.5" rx="1" fill="#E0F2FE"/>
    </svg>
  )
}

function Variant7() {
  // RL reward / area chart
  return (
    <svg viewBox="0 0 112 72" fill="none" className="w-full h-full">
      <rect width="112" height="72" rx="0" fill="#F0FDF4"/>
      <rect x="8" y="6" width="96" height="4" rx="2" fill="#BBF7D0" opacity="0.7"/>
      <rect x="8" y="13" width="72" height="3" rx="1.5" fill="#DCFCE7"/>
      <line x1="16" y1="56" x2="100" y2="56" stroke="#16A34A" strokeWidth="0.5" opacity="0.3"/>
      <line x1="16" y1="24" x2="16" y2="56" stroke="#16A34A" strokeWidth="0.5" opacity="0.3"/>
      <path d="M18 52 Q28 48 38 42 Q48 36 58 30 Q68 26 78 25 Q88 24 98 23" stroke="#22C55E" strokeWidth="2" fill="none"/>
      <path d="M18 52 Q28 48 38 42 Q48 36 58 30 Q68 26 78 25 Q88 24 98 23 L98 56 L18 56 Z" fill="#22C55E" opacity="0.08"/>
      <rect x="8" y="64" width="60" height="2.5" rx="1" fill="#DCFCE7"/>
    </svg>
  )
}

const variants = [Variant1, Variant2, Variant3, Variant4, Variant5, Variant6, Variant7]

export function PaperThumbnail({ variant, className = '', paperId, thumbnailUrl, title, abstractText }: PaperThumbnailProps) {
  const idx = ((variant - 1) % variants.length)
  const Component = variants[idx]
  const numericPaperId = parsePaperId(paperId)
  const previewLabel = title ? `PDF thumbnail: ${title}` : 'PDF thumbnail'
  const hasPdfSource = numericPaperId !== null || Boolean(thumbnailUrl && isPdfLikeUrl(thumbnailUrl))
  const imageThumbnailUrl = thumbnailUrl && !isPdfLikeUrl(thumbnailUrl) ? thumbnailUrl : ''
  const hasPageText = Boolean(compactText(title) || compactText(abstractText))

  return (
    <div className={`relative overflow-hidden rounded-[12px] border border-[#E2E8F0]/70 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.06)] ${className}`}>
      {imageThumbnailUrl ? (
        <img
          src={imageThumbnailUrl}
          alt={previewLabel}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : hasPageText ? (
        <PdfFirstPagePreview
          variant={variant}
          title={title}
          abstractText={abstractText}
          hasPdfSource={hasPdfSource}
        />
      ) : (
        <Component />
      )}
      {hasPdfSource && !hasPageText && (
        <div className="absolute right-1.5 bottom-1.5 rounded-md border border-white/80 bg-white/90 px-1.5 py-[1px] text-[9px] font-bold tracking-[0.08em] text-[#2563EB] shadow-[0_2px_8px_rgba(15,23,42,0.12)] backdrop-blur-sm">
          PDF
        </div>
      )}
    </div>
  )
}
