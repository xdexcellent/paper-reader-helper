/**
 * DailyReportDrawer — Right-side drawer showing the full daily briefing report.
 * Reuses old briefing data/logic with new dashboard UI styling.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Drawer, DrawerContent, DrawerClose } from '@/components/ui/drawer'
import { FileText, Clock, Zap, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, X, RefreshCw, BookOpen } from 'lucide-react'
import type { DailyBriefingSnapshot, Paper } from '../../types'
import {
  getBriefingHighlights,
  getBriefingKeywords,
  getBriefingRiskLevel,
  getBriefingGeneratedTime,
  cleanMarkdownSummaryLine,
} from '../DailyBriefingShell.helpers'
import { showToast } from './DashboardToast'

type DailyReportDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  briefing: DailyBriefingSnapshot | null
  papers: Paper[]
  loading: boolean
  error: string
  onGenerateReport: () => void
  runningToday: boolean
}

/** Extract structured sections from the briefing markdown */
function extractSections(markdown: string) {
  const lines = markdown.split('\n')

  // Extract bullet points as "三条主线"
  const bulletPoints = lines
    .map(l => l.trim())
    .filter(l => /^[-*+]\s+/.test(l) || /^\d+[.)]\s+/.test(l))
    .map(cleanMarkdownSummaryLine)
    .filter(l => l.length >= 10 && l.length < 120)
    .slice(0, 5)

  // Extract hot topics as structured blocks (heading + body paragraphs)
  type HotTopic = { title: string; paragraphs: string[] }
  const hotTopics: HotTopic[] = []
  let currentTopic: HotTopic | null = null

  for (const line of lines) {
    const headingMatch = /^#{1,3}\s+(.+)/.exec(line)
    if (headingMatch) {
      const heading = cleanMarkdownSummaryLine(headingMatch[1])
      if (heading.length > 4 && heading.length < 80 && !/概览|总结|结论|日期|参考|目录/.test(heading)) {
        if (currentTopic && currentTopic.paragraphs.length > 0) {
          hotTopics.push(currentTopic)
        }
        currentTopic = { title: heading, paragraphs: [] }
      }
      continue
    }

    if (currentTopic) {
      const trimmed = line.trim()
      if (trimmed.length > 0) {
        const cleaned = cleanMarkdownSummaryLine(trimmed)
        if (cleaned.length >= 8) {
          currentTopic.paragraphs.push(cleaned)
        }
      }
    }
  }
  if (currentTopic && currentTopic.paragraphs.length > 0) {
    hotTopics.push(currentTopic)
  }

  return { hotTopics: hotTopics.slice(0, 6), bulletPoints }
}

export function DailyReportDrawer({
  open,
  onOpenChange,
  briefing,
  papers,
  loading,
  error,
  onGenerateReport,
  runningToday,
}: DailyReportDrawerProps) {
  const navigate = useNavigate()
  const [expandedPapers, setExpandedPapers] = useState<Set<number>>(new Set())

  const highlights = useMemo(() => {
    if (!briefing) return []
    return getBriefingHighlights(briefing.summary_markdown, briefing.top_papers)
  }, [briefing])

  const keywords = useMemo(() => {
    if (!briefing) return []
    return getBriefingKeywords(briefing, papers)
  }, [briefing, papers])

  const riskLevel = useMemo(() => {
    if (!briefing) return '低'
    return getBriefingRiskLevel(briefing.failed_items?.length ?? 0)
  }, [briefing])

  const sections = useMemo(() => {
    if (!briefing) return { hotTopics: [], bulletPoints: [] }
    return extractSections(briefing.summary_markdown)
  }, [briefing])

  const generatedTime = briefing ? getBriefingGeneratedTime(briefing.generated_at) : '--:--'

  function togglePaperExpand(rank: number) {
    setExpandedPapers(prev => {
      const next = new Set(prev)
      if (next.has(rank)) next.delete(rank)
      else next.add(rank)
      return next
    })
  }

  function handleOpenPaper(paperId: number | null) {
    if (paperId === null) {
      showToast('该论文暂无详情页', 'info')
      return
    }
    navigate(`/paper/${paperId}`)
    onOpenChange(false)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="!w-[820px] !max-w-[820px] !rounded-l-2xl !border-l border-[#E2E8F0]"
        style={{ background: '#FFFFFF', color: '#0F172A' }}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Fixed Header */}
          <div className="shrink-0 border-b border-[#F1F5F9] px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A]">
                  {briefing ? `${briefing.briefing_date} 每日速览` : '今日日报'}
                </h2>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-[#94A3B8]">
                  {briefing && (
                    <>
                      <span className="flex items-center gap-1"><FileText size={12} />论文 {briefing.paper_count}</span>
                      <span>·</span>
                      <span>项目 {briefing.project_count}</span>
                      <span>·</span>
                      <span>订阅源 {briefing.source_count}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Clock size={12} />{generatedTime}</span>
                    </>
                  )}
                </div>
              </div>
              <DrawerClose className="rounded-lg p-2 text-[#94A3B8] hover:text-[#334155] hover:bg-[#F8FAFC] transition-colors">
                <X size={18} />
              </DrawerClose>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Loading */}
            {loading && !briefing && (
              <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
                <RefreshCw size={24} className="animate-spin mb-3" />
                <span className="text-[13px]">正在加载日报...</span>
              </div>
            )}

            {/* Error */}
            {error && !briefing && (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle size={24} className="text-[#EF4444] mb-3" />
                <span className="text-[13px] text-[#EF4444] mb-3">{error}</span>
                <button onClick={onGenerateReport} disabled={runningToday} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50">
                  {runningToday ? '生成中...' : '生成日报'}
                </button>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && !briefing && (
              <div className="flex flex-col items-center justify-center py-20">
                <FileText size={32} className="text-[#CBD5E1] mb-3" />
                <span className="text-[14px] text-[#64748B] mb-1">今日日报尚未生成</span>
                <span className="text-[12px] text-[#94A3B8] mb-4">点击下方按钮开始生成今日速览</span>
                <button onClick={onGenerateReport} disabled={runningToday} className="rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50">
                  {runningToday ? '生成中...' : '生成日报'}
                </button>
              </div>
            )}

            {/* ═══ Report Content ═══ */}
            {briefing && (
              <>
                {/* ── 今日工作概览 ── */}
                <section className="rounded-[14px] border border-[#F1F5F9] bg-gradient-to-br from-[#F8FBFF] to-[#F0F7FF] p-5">
                  <h3 className="text-[14px] font-semibold text-[#0F172A] mb-3">今日工作概览</h3>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="rounded-[10px] bg-white border border-[#E2E8F0]/60 p-3 text-center">
                      <div className="text-[22px] font-bold text-[#4F46E5]">{briefing.paper_count}</div>
                      <div className="text-[11px] text-[#64748B]">论文候选</div>
                    </div>
                    <div className="rounded-[10px] bg-white border border-[#E2E8F0]/60 p-3 text-center">
                      <div className="text-[22px] font-bold text-[#14B8A6]">{briefing.project_count}</div>
                      <div className="text-[11px] text-[#64748B]">相关项目</div>
                    </div>
                    <div className="rounded-[10px] bg-white border border-[#E2E8F0]/60 p-3 text-center">
                      <div className="text-[22px] font-bold text-[#2563EB]">{briefing.source_count}</div>
                      <div className="text-[11px] text-[#64748B]">订阅源</div>
                    </div>
                    <div className="rounded-[10px] bg-white border border-[#E2E8F0]/60 p-3 text-center">
                      <div className="text-[22px] font-bold text-[#F97316]">{riskLevel}</div>
                      <div className="text-[11px] text-[#64748B]">风险等级</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {keywords.map(kw => (
                      <span key={kw} className="rounded-full bg-white border border-[#E2E8F0] px-2.5 py-[2px] text-[11px] text-[#64748B]">{kw}</span>
                    ))}
                    {briefing.trigger_type && (
                      <span className="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-[2px] text-[11px] text-[#2563EB]">
                        {briefing.trigger_type === 'manual' ? '手动补跑' : '自动生成'}
                      </span>
                    )}
                  </div>
                </section>

                {/* ── 今日概览：一句话结论 ── */}

                {/* ── 先看这三条结论 / 三条主线 ── */}
                {highlights.length > 0 && (
                  <section className="rounded-[14px] border border-[#F1F5F9] bg-white p-4">
                    <h3 className="text-[14px] font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                      <Zap size={14} className="text-[#F59E0B]" />
                      先看这三条结论
                    </h3>
                    <ol className="space-y-2.5">
                      {highlights.map((item, index) => (
                        <li key={index} className="flex gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 text-[11px] font-bold text-white">
                            {index + 1}
                          </span>
                          <p className="text-[13px] text-[#334155] leading-relaxed">{item}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {/* ── 三条主线 / 必读清单 ── */}
                {sections.bulletPoints.length > 0 && (
                  <section className="rounded-[14px] border border-[#F1F5F9] bg-white p-4">
                    <h3 className="text-[14px] font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                      <BookOpen size={14} className="text-[#2563EB]" />
                      三条主线 / 必读清单
                    </h3>
                    <ul className="space-y-2">
                      {sections.bulletPoints.map((point, index) => (
                        <li key={index} className="flex gap-2.5 text-[13px] text-[#334155]">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB]" />
                          <span className="leading-relaxed">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* ── 热点方向 ── */}
                {sections.hotTopics.length > 0 && (
                  <section className="rounded-[14px] border border-[#F1F5F9] bg-white p-5">
                    <h3 className="text-[15px] font-semibold text-[#0F172A] mb-4 flex items-center gap-2">
                      <span className="w-1 h-5 rounded-full bg-[#2563EB]" />
                      热点方向
                    </h3>
                    <div className="space-y-5">
                      {sections.hotTopics.map((topic, index) => (
                        <div key={index} className="relative">
                          {/* Numbered heading */}
                          <h4 className="text-[14px] font-semibold text-[#0F172A] mb-2">
                            <span className="text-[#64748B] mr-1.5">{index + 1}.</span>
                            {topic.title}
                          </h4>
                          {/* Body paragraphs */}
                          <div className="space-y-2 pl-4 border-l-2 border-[#F1F5F9]">
                            {topic.paragraphs.slice(0, 6).map((para, pIdx) => {
                              // Highlight lines that start with 论文N or 判断: or 为什么
                              const isPaperRef = /^论文\d|^Paper\s?\d/i.test(para)
                              const isJudgment = /^判断[:：]|^为什么/.test(para)
                              return (
                                <p
                                  key={pIdx}
                                  className={`text-[13px] leading-relaxed ${
                                    isPaperRef
                                      ? 'text-[#2563EB] bg-blue-50/50 rounded px-2 py-1 -ml-2'
                                      : isJudgment
                                        ? 'text-[#334155] font-medium'
                                        : 'text-[#64748B]'
                                  }`}
                                >
                                  {isJudgment && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F97316] mr-1.5 relative top-[-1px]" />}
                                  {para}
                                </p>
                              )
                            })}
                          </div>
                          {/* Separator between topics */}
                          {index < sections.hotTopics.length - 1 && (
                            <div className="mt-4 border-b border-[#F8FAFC]" />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── 关键建议 · Top Papers ── */}
                {briefing.top_papers.length > 0 && (
                  <section className="rounded-[14px] border border-[#F1F5F9] bg-white p-4">
                    <h3 className="text-[14px] font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                      <FileText size={14} className="text-[#2563EB]" />
                      关键建议 · Top {Math.min(5, briefing.top_papers.length)}
                    </h3>
                    <div className="space-y-2">
                      {briefing.top_papers.slice(0, 5).map((item) => {
                        const isExpanded = expandedPapers.has(item.rank)
                        return (
                          <div key={item.rank} className="rounded-[10px] border border-[#F1F5F9] bg-[#FAFBFC] p-3">
                            <div className="flex items-start gap-3">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white bg-[#2563EB]">
                                {item.rank}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="text-[13px] font-medium text-[#0F172A] line-clamp-1">{item.title ?? '未知标题'}</h4>
                                  <span className="shrink-0 text-[11px] text-[#94A3B8]">{item.source_kind}</span>
                                </div>
                                <p className="mt-1 text-[12px] text-[#64748B] leading-relaxed">{item.reason}</p>
                                {isExpanded && item.summary_text && (
                                  <p className="mt-2 text-[12px] text-[#94A3B8] leading-relaxed border-t border-[#F1F5F9] pt-2">{item.summary_text}</p>
                                )}
                                <div className="mt-2 flex items-center gap-3">
                                  {item.summary_text && (
                                    <button onClick={() => togglePaperExpand(item.rank)} className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:text-[#1d4ed8]">
                                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                      {isExpanded ? '收起摘要' : '展开摘要'}
                                    </button>
                                  )}
                                  <button onClick={() => handleOpenPaper(item.paper_id)} className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:text-[#1d4ed8]">
                                    <ExternalLink size={12} />
                                    打开论文
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* ── 风险提示 ── */}
                {briefing.failed_items && briefing.failed_items.length > 0 && (
                  <section className="rounded-[14px] border border-orange-100 bg-[#FFF7ED] p-4">
                    <h3 className="text-[14px] font-semibold text-[#0F172A] mb-2 flex items-center gap-2">
                      <AlertTriangle size={14} className="text-[#F97316]" />
                      风险提示
                    </h3>
                    <ul className="space-y-1.5">
                      {briefing.failed_items.map((item, index) => (
                        <li key={index} className="text-[12px] text-[#64748B]">
                          <span className="font-medium text-[#334155]">{item.title}</span>
                          {item.reason && <span className="ml-2 text-[#94A3B8]">— {item.reason}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* ── 相关项目 ── */}
                {briefing.projects.length > 0 && (
                  <section className="rounded-[14px] border border-[#F1F5F9] bg-white p-4">
                    <h3 className="text-[14px] font-semibold text-[#0F172A] mb-3">相关项目</h3>
                    <div className="space-y-2">
                      {briefing.projects.map((project, index) => (
                        <div key={index} className="rounded-[10px] border border-[#F1F5F9] bg-[#FAFBFC] p-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[13px] font-medium text-[#0F172A]">{project.title}</h4>
                            <span className="text-[11px] text-[#94A3B8]">{project.source_kind}</span>
                          </div>
                          <p className="mt-1 text-[12px] text-[#64748B]">{project.summary}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── 生成状态 ── */}
                <section className="rounded-[14px] border border-[#F1F5F9] bg-[#F8FAFC] p-3">
                  <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                    <span>{briefing.briefing_date}</span>
                    <span>生成于 {generatedTime}</span>
                    <span>{briefing.trigger_type === 'manual' ? '手动补跑' : '自动生成'}</span>
                    {briefing.fallback_used && <span className="text-[#F97316]">回退内容</span>}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
