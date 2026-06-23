import { cn } from '@/lib/utils'

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
