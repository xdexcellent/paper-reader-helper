import { cn } from '@/lib/utils'
import type { VenueRankInfo } from '../types'

type RankBadgeProps = {
  ccf?: string
  sciZone?: string
  impactFactor?: string
  className?: string
}

const BADGE_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap'

function ccfVariant(rank: string): string {
  if (rank === 'A') {
    return 'border-amber-500/45 bg-gradient-to-br from-amber-500/22 to-orange-400/14 text-amber-600'
  }
  if (rank === 'B') {
    return 'border-blue-500/40 bg-gradient-to-br from-blue-500/22 to-indigo-400/14 text-blue-600'
  }
  return 'border-border bg-muted text-muted-foreground'
}

function sciVariant(zone: string): string {
  if (zone.includes('1')) {
    return 'border-red-500/45 bg-gradient-to-br from-red-500/22 to-rose-400/14 text-red-600'
  }
  if (zone.includes('2')) {
    return 'border-orange-500/45 bg-gradient-to-br from-orange-500/22 to-amber-400/14 text-orange-600'
  }
  if (zone.includes('3')) {
    return 'border-blue-500/40 bg-gradient-to-br from-blue-500/22 to-indigo-400/14 text-blue-600'
  }
  return 'border-border bg-muted text-muted-foreground'
}

export function RankBadge({ ccf, sciZone, impactFactor, className }: RankBadgeProps) {
  const ccfVal = ccf?.trim() ?? ''
  const sciVal = sciZone?.trim() ?? ''
  const ifVal = impactFactor?.trim() ?? ''
  if (!ccfVal && !sciVal && !ifVal) {
    return null
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {ccfVal && <span className={cn(BADGE_BASE, ccfVariant(ccfVal))}>CCF-{ccfVal}</span>}
      {sciVal && <span className={cn(BADGE_BASE, sciVariant(sciVal))}>SCI {sciVal}</span>}
      {ifVal && (
        <span className={cn(BADGE_BASE, 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/22 to-teal-400/14 text-emerald-600')}>
          IF {ifVal}
        </span>
      )}
    </span>
  )
}

function jcrVariant(zone: string): string {
  if (zone === 'Q1') return 'border-red-500/45 bg-gradient-to-br from-red-500/22 to-rose-400/14 text-red-600'
  if (zone === 'Q2') return 'border-orange-500/45 bg-gradient-to-br from-orange-500/22 to-amber-400/14 text-orange-600'
  if (zone === 'Q3') return 'border-blue-500/40 bg-gradient-to-br from-blue-500/22 to-indigo-400/14 text-blue-600'
  if (zone === 'Q4') return 'border-slate-400/40 bg-gradient-to-br from-slate-400/22 to-gray-400/14 text-slate-500'
  return 'border-border bg-muted text-muted-foreground'
}

function casVariant(zone: string): string {
  const base = zone.replace('Top', '').trim()
  if (base.includes('1')) return 'border-red-500/45 bg-gradient-to-br from-red-500/22 to-rose-400/14 text-red-600'
  if (base.includes('2')) return 'border-orange-500/45 bg-gradient-to-br from-orange-500/22 to-amber-400/14 text-orange-600'
  if (base.includes('3')) return 'border-blue-500/40 bg-gradient-to-br from-blue-500/22 to-indigo-400/14 text-blue-600'
  if (base.includes('4')) return 'border-slate-400/40 bg-gradient-to-br from-slate-400/22 to-gray-400/14 text-slate-500'
  return 'border-border bg-muted text-muted-foreground'
}

type VenueRankBadgesProps = {
  venueRank?: VenueRankInfo | null
  className?: string
}

export function VenueRankBadges({ venueRank, className }: VenueRankBadgesProps) {
  if (!venueRank) return null

  const items: { key: string; label: string; value: string; variant?: string }[] = []

  if (venueRank.impact_factor) {
    items.push({ key: 'if', label: 'IF', value: venueRank.impact_factor, variant: 'emerald' })
  }
  if (venueRank.impact_factor_5y) {
    items.push({ key: 'if5', label: 'IF5', value: venueRank.impact_factor_5y, variant: 'emerald' })
  }
  if (venueRank.jcr_sci) {
    items.push({ key: 'jcr-sci', label: 'JCR-SCI', value: venueRank.jcr_sci, variant: 'jcr' })
  }
  if (venueRank.jcr_ssci) {
    items.push({ key: 'jcr-ssci', label: 'JCR-SSCI', value: venueRank.jcr_ssci, variant: 'jcr' })
  }
  if (venueRank.cas_upgrade) {
    items.push({ key: 'cas', label: '中科院', value: venueRank.cas_upgrade, variant: 'cas' })
  }
  if (venueRank.jci) {
    items.push({ key: 'jci', label: 'JCI', value: venueRank.jci })
  }
  if (venueRank.esi) {
    items.push({ key: 'esi', label: 'ESI', value: venueRank.esi })
  }
  if (venueRank.warn) {
    items.push({ key: 'warn', label: '⚠ 预警', value: venueRank.warn, variant: 'danger' })
  }

  if (items.length === 0) return null

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {items.map((item) => {
        let extraClass = 'border-border bg-muted text-muted-foreground'
        if (item.variant === 'emerald') {
          extraClass = 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/22 to-teal-400/14 text-emerald-600'
        } else if (item.variant === 'jcr') {
          extraClass = jcrVariant(item.value)
        } else if (item.variant === 'cas') {
          extraClass = casVariant(item.value)
        } else if (item.variant === 'danger') {
          extraClass = 'border-red-500/60 bg-red-50 text-red-600 font-bold'
        }
        return (
          <span key={item.key} className={cn(BADGE_BASE, extraClass)}>
            {item.label} {item.value}
          </span>
        )
      })}
    </span>
  )
}
