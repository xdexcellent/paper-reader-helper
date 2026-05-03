import { BriefingDateField } from './BriefingDateField'
import { StatusBadge } from './StatusBadge'
import type { DailyBriefingHistoryItem } from '../types'

export function BriefingHistoryPicker({
  value,
  history,
  onChange,
}: {
  value: string
  history: DailyBriefingHistoryItem[]
  onChange: (next: string) => void
}) {
  return (
    <div className="briefing-history-picker-stack">
      <BriefingDateField
        label="浏览日期"
        value={value}
        helperText="通过日历快速跳转到某一天的日报"
        ariaLabel="浏览日报日期"
        onChange={onChange}
        variant="compact"
      />
      {history.length > 0 ? (
        <div className="briefing-history-list" aria-label="日报历史">
          {history.map((item) => {
            const active = item.briefing_date === value
            return (
              <button
                key={`${item.briefing_date}-${item.generated_at}`}
                type="button"
                className={`briefing-history-item${active ? ' active' : ''}`}
                onClick={() => onChange(item.briefing_date)}
              >
                <div className="briefing-history-item-top">
                  <strong>{item.briefing_date}</strong>
                  <StatusBadge value={item.status} />
                </div>
                <div className="briefing-history-item-meta">
                  <span>{new Date(item.generated_at).toLocaleString('zh-CN')}</span>
                  {item.trigger_type ? <span>{item.trigger_type === 'manual' ? '手动补跑' : '自动生成'}</span> : null}
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
