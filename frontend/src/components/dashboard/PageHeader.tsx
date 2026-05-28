import React from 'react'

export type PageHeaderProps = {
  title?: string
  subtitle?: string
  date?: string
  day?: string
  lastUpdate?: string
  readingProgress?: string
  manualAdditions?: string
}

function formatDisplayDate(isoDate?: string): string {
  if (!isoDate) return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  try {
    const d = new Date(isoDate + 'T00:00:00')
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return isoDate
  }
}

function formatDisplayDay(isoDate?: string): string {
  if (!isoDate) return new Date().toLocaleDateString('zh-CN', { weekday: 'long' })
  try {
    const d = new Date(isoDate + 'T00:00:00')
    return d.toLocaleDateString('zh-CN', { weekday: 'long' })
  } catch {
    return ''
  }
}

export function PageHeader(props: PageHeaderProps = {}) {
  const {
    title = '今日工作概览',
    subtitle = '聚合今日论文、项目、风险与关键信息，助你高效推进研究进程。',
    date,
    day,
    lastUpdate = '最后更新 --:--',
    readingProgress = '阅读进度 0%',
    manualAdditions,
  } = props

  const displayDate = date ? formatDisplayDate(date) : formatDisplayDate()
  const displayDay = day ?? formatDisplayDay(date)

  const infoItems = [displayDate, displayDay, lastUpdate, readingProgress]
  if (manualAdditions) infoItems.push(manualAdditions)

  return (
    <div className="mb-1">
      <h1 className="font-bold text-[22px] text-[#0F172A]">{title}</h1>
      <p className="text-[13px] text-[#64748B] mt-0.5">{subtitle}</p>
      <div className="flex items-center gap-2 mt-2">
        {infoItems.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <span className="w-[3px] h-[3px] rounded-full bg-[#CBD5E1]" />
            )}
            <span className="text-[11px] text-[#94A3B8]">{item}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export default PageHeader
