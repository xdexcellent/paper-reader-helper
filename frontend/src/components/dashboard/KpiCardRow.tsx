import { KpiCard, type KpiCardProps } from './KpiCard'

type KpiCardRowProps = {
  metrics: KpiCardProps[]
  onMetricClick?: (metric: KpiCardProps) => void
}

export function KpiCardRow({ metrics, onMetricClick }: KpiCardRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
      {metrics.map((metric, i) => (
        <div key={metric.label} className={`dash-kpi-card`}>
          <KpiCard
            label={metric.label}
            value={metric.value}
            trend={metric.trend}
            icon={metric.icon}
            color={metric.color}
            onClick={onMetricClick ? () => onMetricClick(metric) : undefined}
          />
        </div>
      ))}
    </div>
  )
}
