import { KpiCard, type KpiCardProps } from './KpiCard'

type KpiCardRowProps = {
  metrics: KpiCardProps[]
}

export function KpiCardRow({ metrics }: KpiCardRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
      {metrics.map((metric) => (
        <KpiCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          trend={metric.trend}
          icon={metric.icon}
          color={metric.color}
        />
      ))}
    </div>
  )
}
