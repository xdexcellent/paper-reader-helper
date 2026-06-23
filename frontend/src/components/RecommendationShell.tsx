import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { fetchRecommendations, type RecommendationItem } from '../lib/api'
import { SYSTEM_DEFAULT_MODEL_VALUE, useAiModelOptions } from '../lib/aiModels'
import type { Paper } from '../types'
import { Icon, type IconName } from './UiIcon'

// Daily cache keyed by (date|paperHash|model). Only refetches if any key changes
// or user explicitly forces refresh.
interface RecommendationCacheEntry {
  signature: string
  data: RecommendationItem[]
}
let recommendationCache: RecommendationCacheEntry | null = null

function buildCacheSignature(papers: Paper[], model: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const paperHash = papers
    .map(p => JSON.stringify({
      id: p.id,
      title: p.title,
      source: p.source,
      authors: p.authors ?? '',
      venue: p.venue ?? '',
      year: p.year ?? '',
      status: p.status,
      parse_status: p.parse_status,
      summary_status: p.summary_status,
      embedding_status: p.embedding_status,
      category_status: p.category_status ?? '',
      tags: [...(p.tags ?? [])].sort(),
      updated_at: p.updated_at ?? '',
    }))
    .sort()
    .join('|')
  return `${today}::${model || 'system-default'}::${paperHash}`
}

type RecommendationViewItem = RecommendationItem & {
  category: string
  category_label: string
  status_label: string
  action_label: string
  action_hint: string
  confidence: number
  signals: string[]
  score_breakdown: string[]
  tag: string
  future_direction: string
  priority_icon: IconName
}

type TopicRecommendation = {
  name: string
  paperCount: number
  signalCount: number
  strength: number
  icon: IconName
}

type CollaboratorRecommendation = {
  name: string
  org: string
  match: number
}

type ReadingRouteStep = {
  title: string
  range: string
  text: string
}

const categoryOrder = ['all', 'read_now', 'summarize_next', 'process_next', 'recover']
const categoryLabels: Record<string, string> = {
  all: '全部推荐',
  read_now: '优先阅读',
  summarize_next: '补充摘要',
  process_next: '推进处理',
  recover: '修复处理',
}

const categoryTabLabels: Record<string, string> = {
  all: '综合推荐',
  read_now: '优先阅读',
  summarize_next: '补充摘要',
  process_next: '处理中',
  recover: '待修复',
}

const categoryDescriptions: Record<string, string> = {
  all: '按综合分数排序',
  read_now: '信息完整，适合直接阅读',
  summarize_next: '解析完成，优先补摘要',
  process_next: '仍在处理链路中的论文',
  recover: '失败任务，建议先修复',
}

const metricToneClasses = [
  'bg-sky-500/10 text-sky-600',
  'bg-blue-500/10 text-blue-600',
  'bg-indigo-500/10 text-indigo-600',
  'bg-violet-500/10 text-violet-600',
  'bg-orange-500/10 text-orange-600',
]

export function RecommendationShell({ papers }: { papers: Paper[] }) {
  const navigate = useNavigate()
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(recommendationCache?.data || [])
  const [loading, setLoading] = useState(!recommendationCache)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>(SYSTEM_DEFAULT_MODEL_VALUE)
  const { modelOptions } = useAiModelOptions(selectedModel, setSelectedModel)
  const [refreshing, setRefreshing] = useState(false)
  const deferredQuery = useDeferredValue(query)

  async function loadRecommendations(force = false) {
    const signature = buildCacheSignature(papers, selectedModel)
    if (!force && recommendationCache && recommendationCache.signature === signature) {
      setRecommendations(recommendationCache.data)
      setLoading(false)
      return
    }
    if (force) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')
    try {
      const data = await fetchRecommendations({ force, model: selectedModel })
      recommendationCache = { signature, data }
      setRecommendations(data)
    } catch (err) {
      const fallback = buildLocalRecommendations(papers)
      recommendationCache = { signature, data: fallback }
      setRecommendations(fallback)
      setError(err instanceof Error ? err.message : '推荐服务暂不可用，已使用本地规则生成。')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadRecommendations(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers, selectedModel])

  const viewItems = recommendations.map(normalizeRecommendation)
  const categoryCounts = categoryOrder.reduce<Record<string, number>>((acc, category) => {
    acc[category] = category === 'all'
      ? viewItems.length
      : viewItems.filter(item => item.category === category).length
    return acc
  }, {})
  const queryText = deferredQuery.trim().toLowerCase()
  const filteredItems = viewItems.filter(item => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory
    if (!matchesCategory) return false
    if (!queryText) return true
    return [
      item.paper.title,
      item.paper.authors ?? '',
      item.reason,
      item.tag,
      item.category_label,
      ...item.signals,
    ].join(' ').toLowerCase().includes(queryText)
  })
  const selectedItem =
    filteredItems.find(item => item.paper.id === selectedPaperId)
    || filteredItems[0]
    || viewItems[0]

  const readyCount = viewItems.filter(item => item.paper.status === 'ready').length
  const highMatchCount = viewItems.filter(item => item.confidence >= 80).length
  const topicRecommendations = buildTopicRecommendations(viewItems)
  const collaboratorRecommendations = buildCollaboratorRecommendations(viewItems)
  const routePlan = buildRoutePlan(viewItems, topicRecommendations)
  const recommendationReasons = buildRecommendationReasons(viewItems)
  const authorCount = collaboratorRecommendations.length
  const summarizeNextCount = categoryCounts.summarize_next || 0

  useEffect(() => {
    if (selectedPaperId === null && viewItems.length > 0) {
      setSelectedPaperId(viewItems[0].paper.id)
    }
  }, [selectedPaperId, viewItems])

  if (loading) {
    return (
      <Card className="flex min-h-[360px] rounded-xl border-border/70 bg-card">
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <div className="loading-spinner" aria-hidden="true" />
          <span>正在生成推荐...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 bg-background text-foreground">
      <header className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold leading-8 tracking-normal text-foreground">
            AI 智能推荐
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            基于当前论文库的处理状态、摘要、标签和语义信号生成可追溯推荐。
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="relative block w-full xl:w-[360px]">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索论文、作者或关键词"
              aria-label="搜索推荐论文"
              className="h-9 rounded-lg bg-card pl-9 pr-12 text-sm shadow-sm"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              ⌘ K
            </kbd>
          </label>

          <label className="grid min-w-[160px] gap-1 text-xs font-medium text-muted-foreground">
            <span>推荐模型</span>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={refreshing}
              aria-label="选择推荐模型"
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              {modelOptions.map(model => (
                <option key={model.value || 'system-default'} value={model.value}>{model.label}</option>
              ))}
              {selectedModel && !modelOptions.some(model => model.value === selectedModel) ? (
                <option value={selectedModel}>{selectedModel}</option>
              ) : null}
            </select>
          </label>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg px-3 shadow-sm"
              onClick={() => void loadRecommendations(true)}
              disabled={refreshing}
              aria-label="重新生成推荐"
            >
              <Icon name="refresh" />
              {refreshing ? '生成中…' : '重新生成推荐'}
            </Button>
          </div>
        </div>
      </header>

      <Card className="rounded-lg border-border/70 bg-card shadow-sm">
        <CardContent className="grid gap-0 p-0 sm:grid-cols-2 xl:grid-cols-5" aria-label="推荐概览">
          <DashboardMetric
            icon="fileText"
            label="推荐论文"
            value={viewItems.length}
            detail={`已就绪 ${readyCount} 篇`}
            iconClassName={metricToneClasses[0]}
          />
          <DashboardMetric
            icon="target"
            label="匹配度 > 80%"
            value={highMatchCount}
            detail="高相关论文"
            iconClassName={metricToneClasses[1]}
          />
          <DashboardMetric
            icon="link"
            label="方向信号"
            value={topicRecommendations.length}
            detail={topicRecommendations.length > 0 ? '来自论文标签' : '暂无标签'}
            iconClassName={metricToneClasses[2]}
          />
          <DashboardMetric
            icon="assistant"
            label="相关作者"
            value={authorCount}
            detail={authorCount > 0 ? '来自作者字段' : '暂无作者数据'}
            iconClassName={metricToneClasses[3]}
          />
          <DashboardMetric
            icon="calendar"
            label="待补摘要"
            value={summarizeNextCount}
            detail="解析完成未摘要"
            iconClassName={metricToneClasses[4]}
          />
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-muted-foreground">
          推荐 API 暂不可用：{error}。当前展示为本地规则推荐。
        </div>
      ) : null}

      {viewItems.length === 0 ? (
        <Card className="rounded-lg border-dashed border-border/70 bg-card">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center">
            <Icon name="fileText" className="size-8 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">暂无可推荐论文</h3>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">请先导入并解析论文，推荐系统会根据处理状态、摘要和标签生成候选。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-h-0 gap-4 2xl:grid-cols-[minmax(720px,1fr)_minmax(360px,520px)]">
          <div className="flex min-h-0 flex-col gap-4">
            <Card className="overflow-hidden rounded-lg border-border/70 bg-card shadow-sm">
              <CardHeader className="flex flex-col gap-3 border-b border-border/70 pb-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-foreground">为你推荐的论文</CardTitle>
                  <CardDescription className="mt-1">
                    {categoryDescriptions[activeCategory]}，共 {filteredItems.length} 项
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Tabs
                    value={activeCategory}
                    onValueChange={(value) => startTransition(() => setActiveCategory(String(value)))}
                    className="w-full sm:w-auto"
                  >
                    <TabsList className="h-8 w-full justify-start gap-1 rounded-lg bg-muted p-1 sm:w-auto" aria-label="推荐类型筛选">
                      {categoryOrder.slice(0, 4).map(category => (
                        <TabsTrigger
                          key={category}
                          value={category}
                          disabled={category !== 'all' && !categoryCounts[category]}
                          className="h-6 flex-none rounded-md px-2.5 text-xs"
                        >
                          {categoryTabLabels[category] || categoryLabels[category]}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  {categoryCounts.recover ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-amber-500/30 text-amber-700 dark:text-amber-400"
                      onClick={() => startTransition(() => setActiveCategory('recover'))}
                    >
                      待修复 {categoryCounts.recover}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {filteredItems.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
                    <Icon name="search" className="size-8 text-muted-foreground" />
                    <h3 className="text-base font-semibold text-foreground">没有匹配当前筛选条件的推荐</h3>
                    <p className="max-w-md text-sm leading-6 text-muted-foreground">切换推荐类型或清空搜索词后再试。</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/70" aria-label="推荐论文列表">
                    {filteredItems.slice(0, 8).map((item, index) => (
                      <RecommendationRow
                        key={item.paper.id}
                        item={item}
                        index={index}
                        selected={selectedItem?.paper.id === item.paper.id}
                        onSelect={() => setSelectedPaperId(item.paper.id)}
                      />
                    ))}
                  </div>
                )}

              </CardContent>
            </Card>

            <Card className="rounded-lg border-border/70 bg-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-foreground">个性化阅读路线图</CardTitle>
                <CardDescription>按当前推荐列表的可用信息组织处理路径</CardDescription>
              </CardHeader>
              <CardContent>
                {routePlan.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-5">
                    {routePlan.map((step, index) => (
                      <ReadingStep key={`${step.title}-${index}`} step={step} index={index} />
                    ))}
                  </div>
                ) : (
                  <EmptyPanel text="当前没有可生成路线图的推荐论文。" />
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="grid min-h-0 gap-4 lg:grid-cols-3 2xl:flex 2xl:max-h-[calc(100vh-260px)] 2xl:flex-col">
            <Card className="overflow-hidden rounded-lg border-border/70 bg-card shadow-sm lg:min-h-[260px] 2xl:min-h-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">研究方向推荐</CardTitle>
                <CardDescription>仅从当前推荐论文的真实标签和 AI 标签字段提取</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[260px] space-y-1 overflow-y-auto pb-4 pr-4">
                {topicRecommendations.length > 0 ? (
                  topicRecommendations.map((topic, index) => (
                    <TopicRow key={`${topic.name}-${index}`} topic={topic} index={index} />
                  ))
                ) : (
                  <EmptyPanel text="当前推荐论文缺少可用于提取方向的标签或信号。" />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-lg border-border/70 bg-card shadow-sm lg:min-h-[260px] 2xl:min-h-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">相关作者</CardTitle>
                <CardDescription>仅展示当前推荐论文作者字段，不生成示例姓名</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[260px] space-y-1 overflow-y-auto pb-4 pr-4">
                {collaboratorRecommendations.length > 0 ? (
                  collaboratorRecommendations.map((person, index) => (
                    <CollaboratorRow key={`${person.name}-${index}`} person={person} index={index} />
                  ))
                ) : (
                  <EmptyPanel text="当前推荐论文没有作者字段，暂不展示相关作者。" />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-lg border-border/70 bg-card shadow-sm lg:min-h-[260px] 2xl:min-h-0">
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">推荐理由</CardTitle>
                {selectedItem ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-lg bg-blue-600 px-3 text-white shadow-sm hover:bg-blue-700 hover:shadow-md"
                    onClick={() => navigate(`/paper/${selectedItem.paper.id}`)}
                  >
                    <Icon name="fileText" />
                    {selectedItem.action_label}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="max-h-[340px] space-y-3 overflow-y-auto pb-4 pr-4">
                {recommendationReasons.map((reason, index) => (
                  <div key={reason} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                    <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span>{reason}</span>
                  </div>
                ))}
                {selectedItem ? (
                  <>
                    <Separator />
                    <DetailBlock title="为什么推荐">
                      <p className="text-sm leading-6 text-muted-foreground">{selectedItem.reason}</p>
                    </DetailBlock>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </section>
  )
}

function DashboardMetric({
  icon,
  label,
  value,
  detail,
  iconClassName,
}: {
  icon: IconName
  label: string
  value: number | string
  detail: string
  iconClassName: string
}) {
  return (
    <div className="flex items-center gap-3 border-border/70 px-5 py-4 first:border-l-0 sm:border-l">
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', iconClassName)}>
        <Icon name={icon} className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <strong className="mt-1 block text-xl font-semibold leading-none text-foreground">{value}</strong>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function RecommendationRow({
  item,
  index,
  selected,
  onSelect,
}: {
  item: RecommendationViewItem
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const sourceText = [item.paper.venue || item.paper.source, item.paper.updated_at?.slice(0, 10) || item.paper.year].filter(Boolean).join(' · ')
  const authorText = item.paper.authors || '作者信息待补全'
  const visibleSignals = Array.from(new Set([...(item.paper.tags ?? []), ...item.signals])).slice(0, 4)

  return (
    <button
      type="button"
      className={cn(
        'grid w-full cursor-pointer grid-cols-[18px_46px_minmax(0,1fr)] gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:grid-cols-[18px_48px_minmax(0,1fr)_132px_64px]',
        selected && 'bg-primary/5',
      )}
      onClick={onSelect}
    >
      <span className="mt-4 size-3 rounded border border-border bg-card" aria-hidden="true" />
      <span className="flex h-[60px] w-[46px] shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 text-[10px] font-semibold text-muted-foreground shadow-sm">
        PDF
      </span>

      <span className="min-w-0 space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">{sourceText || `推荐 #${index + 1}`}</span>
        <span className="line-clamp-1 block text-sm font-semibold leading-5 text-foreground">{item.paper.title}</span>
        <span className="line-clamp-1 block text-xs text-muted-foreground">{authorText}</span>
        <span className="flex flex-wrap gap-1">
          {visibleSignals.map(tag => (
            <Badge key={tag} variant="secondary" className="h-5 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground">
              {tag}
            </Badge>
          ))}
        </span>
      </span>

      <span className="hidden self-center lg:block">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">匹配度</span>
        <span className="block text-base font-semibold text-foreground">{item.confidence}%</span>
        <Progress value={item.confidence} className="mt-2 w-24 [&_[data-slot=progress-indicator]]:bg-blue-500 [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:bg-muted" />
      </span>

      <span className="hidden self-center text-right text-xs font-medium text-muted-foreground lg:block">
        {item.status_label}
      </span>
    </button>
  )
}

function TopicRow({
  topic,
  index,
}: {
  topic: TopicRecommendation
  index: number
}) {
  const iconClassName = metricToneClasses[index % metricToneClasses.length]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_44px_72px_44px] items-center gap-2 border-b border-border/70 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', iconClassName)}>
          <Icon name={topic.icon} className="size-3.5" />
        </span>
        <span className="truncate text-sm font-medium text-foreground">{topic.name}</span>
      </div>
      <span className="text-xs text-muted-foreground">{topic.paperCount} 篇</span>
      <Progress value={topic.strength} className="w-full [&_[data-slot=progress-indicator]]:bg-blue-500 [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:bg-muted" />
      <span className="text-right text-xs font-medium text-muted-foreground">{topic.signalCount} 次</span>
    </div>
  )
}

function CollaboratorRow({
  person,
  index,
}: {
  person: CollaboratorRecommendation
  index: number
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_68px] items-center gap-3 border-b border-border/70 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground',
          index % 3 === 0 ? 'bg-slate-900' : index % 3 === 1 ? 'bg-rose-500' : 'bg-slate-500',
        )}>
          {person.name.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{person.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{person.org}</span>
        </span>
      </div>
      <span className="text-right text-xs text-muted-foreground">推荐分 <strong className="font-semibold text-emerald-600">{person.match}%</strong></span>
    </div>
  )
}

function ReadingStep({
  step,
  index,
}: {
  step: ReadingRouteStep
  index: number
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
        <div>
          <h3 className="text-sm font-semibold leading-5 text-primary">{step.title}</h3>
          <p className="text-xs text-muted-foreground">{step.range}</p>
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{step.text}</p>
    </div>
  )
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-normal text-foreground">{title}</h4>
      {children}
    </section>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm leading-6 text-muted-foreground">
      {text}
    </div>
  )
}

function buildTopicRecommendations(items: RecommendationViewItem[]): TopicRecommendation[] {
  const topics = new Map<string, { paperIds: Set<number>; signalCount: number }>()

  items.forEach(item => {
    const names = Array.from(new Set([
      ...(item.paper.tags ?? []),
      item.tag,
    ].map(value => value?.trim()).filter((value): value is string => Boolean(value))))
      .filter(name => isTopicSignal(name, item))

    names.forEach(name => {
      const current = topics.get(name) ?? { paperIds: new Set<number>(), signalCount: 0 }
      current.paperIds.add(item.paper.id)
      current.signalCount += 1
      topics.set(name, current)
    })
  })

  const entries = Array.from(topics.entries())
    .map(([name, value]) => ({
      name,
      paperCount: value.paperIds.size,
      signalCount: value.signalCount,
    }))
    .sort((a, b) => b.paperCount - a.paperCount || b.signalCount - a.signalCount || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 5)
  const maxPaperCount = Math.max(1, ...entries.map(entry => entry.paperCount))

  return entries.map((entry, index) => ({
    ...entry,
    strength: Math.max(12, Math.round((entry.paperCount / maxPaperCount) * 100)),
    icon: ['fileText', 'vector', 'target', 'spark', 'assistant'][index % 5] as IconName,
  }))
}

function isTopicSignal(name: string, item: RecommendationViewItem): boolean {
  const normalized = name.trim().toLowerCase()
  const blocked = new Set([
    item.paper.source?.toLowerCase(),
    item.category.toLowerCase(),
    item.category_label.toLowerCase(),
    item.status_label.toLowerCase(),
    'manual',
    'arxiv',
    'rss',
    'semantic_scholar',
    'dblp',
    'crossref',
    'openalex',
    'pwc',
    'unpaywall',
    'github_trending',
    '本地论文',
    '论文库',
    '优先阅读',
    '补充摘要',
    '推进处理',
    '修复处理',
  ].filter(Boolean))
  if (blocked.has(normalized)) return false
  return !/[：:]/.test(name) && !/(已|待|适合|分类|摘要|解析|处理|状态|置信度|失败|就绪)/.test(name)
}

function buildCollaboratorRecommendations(items: RecommendationViewItem[]): CollaboratorRecommendation[] {
  const authors = new Map<string, { org: string; match: number }>()
  items.forEach(item => {
    splitAuthors(item.paper.authors).forEach(author => {
      const current = authors.get(author)
      const org = item.paper.venue || item.paper.source || '来源待补全'
      if (!current || item.confidence > current.match) {
        authors.set(author, { org, match: item.confidence })
      }
    })
  })
  return Array.from(authors.entries())
    .map(([name, value]) => ({ name, org: value.org, match: value.match }))
    .sort((a, b) => b.match - a.match)
    .slice(0, 5)
}

function splitAuthors(authors?: string): string[] {
  if (!authors) return []
  return authors
    .split(/[;,、，·•]|\band\b/i)
    .map(author => author.trim())
    .filter(Boolean)
}

function buildRecommendationReasons(items: RecommendationViewItem[]): string[] {
  const readNow = items.filter(item => item.category === 'read_now').length
  const needsWork = items.filter(item => item.category !== 'read_now').length
  const tags = Array.from(new Set(items.flatMap(item => item.paper.tags ?? []).filter(Boolean))).slice(0, 2)
  return [
    `基于当前推荐集中 ${Math.max(items.length, 1)} 篇论文的处理状态、摘要状态和标签信号`,
    tags.length ? `标签 ${tags.join('、')} 在推荐集中持续出现` : '当前推荐暂缺标签，建议先补充分类和标签以提升方向分析质量',
    '评分综合考虑就绪程度、摘要可用性、人工分类、标签和已生成的语义相似度信号',
    readNow > 0 ? `${readNow} 篇论文已完成摘要，可直接进入深度阅读` : `${needsWork} 篇论文仍需先完成解析、摘要或修复`,
  ]
}

function buildRoutePlan(
  items: RecommendationViewItem[],
  topics: TopicRecommendation[],
): ReadingRouteStep[] {
  if (items.length === 0) return []

  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1
    return acc
  }, {})
  const topTopic = topics[0]?.name
  const steps: ReadingRouteStep[] = []

  if (counts.recover) {
    steps.push({
      title: '先修复失败',
      range: `${counts.recover} 篇论文`,
      text: '进入详情页重试解析或摘要失败项，避免遗漏候选。',
    })
  }
  if (counts.summarize_next) {
    steps.push({
      title: '补齐摘要',
      range: `${counts.summarize_next} 篇论文`,
      text: '为已解析论文生成中文摘要，提升后续筛选质量。',
    })
  }
  if (counts.read_now) {
    steps.push({
      title: '优先阅读',
      range: `${counts.read_now} 篇论文`,
      text: topTopic ? `先阅读带有“${topTopic}”信号的就绪论文。` : '先阅读已完成摘要的就绪论文。',
    })
  }
  if (counts.process_next) {
    steps.push({
      title: '跟进处理',
      range: `${counts.process_next} 篇论文`,
      text: '等待解析或摘要流程完成后再纳入精读队列。',
    })
  }

  const missingTags = items.filter(item => !(item.paper.tags?.length)).length
  if (missingTags > 0) {
    steps.push({
      title: '补充标签',
      range: `${missingTags} 篇论文`,
      text: '补充研究方向标签后，右侧方向信号会更准确。',
    })
  }

  return steps.slice(0, 5)
}

function normalizeRecommendation(item: RecommendationItem): RecommendationViewItem {
  const category = item.category || categoryForPaper(item.paper)
  return {
    ...item,
    category,
    category_label: item.category_label || categoryLabels[category] || '推荐',
    status_label: item.status_label || statusLabel(item.paper),
    action_label: item.action_label || actionLabel(item.paper),
    action_hint: item.action_hint || actionHint(item.paper),
    confidence: item.confidence ?? confidenceFromScore(item.score),
    signals: item.signals?.length ? item.signals : signalsForPaper(item.paper),
    score_breakdown: item.score_breakdown?.length ? item.score_breakdown : scoreBreakdownForPaper(item.paper),
    tag: item.tag || item.paper.tags?.[0] || item.paper.source,
    future_direction: item.future_direction || futureDirectionForPaper(item.paper),
    priority_icon: iconName(item.priority_icon || iconForCategory(category)),
  }
}

function buildLocalRecommendations(papers: Paper[]): RecommendationItem[] {
  return [...papers]
    .map(paper => {
      const category = categoryForPaper(paper)
      let score = 20
      if (paper.status === 'ready') score += 100
      if (paper.status === 'parsed') score += 80
      if (paper.summary_status === 'completed') score += 30
      if (paper.parse_status === 'completed' && paper.summary_status === 'pending') score += 50
      if (paper.category_status === 'manual_locked') score += 18
      if ((paper.tags?.length || 0) > 0) score += Math.min(paper.tags?.length || 0, 3) * 4

      return {
        paper,
        score,
        reason: reasonForPaper(paper),
        tag: paper.tags?.[0] || paper.source,
        priority_icon: iconForCategory(category),
        future_direction: futureDirectionForPaper(paper),
        category,
        category_label: categoryLabels[category],
        status_label: statusLabel(paper),
        action_label: actionLabel(paper),
        action_hint: actionHint(paper),
        confidence: confidenceFromScore(score),
        signals: signalsForPaper(paper),
        score_breakdown: scoreBreakdownForPaper(paper),
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

function categoryForPaper(paper: Paper): string {
  if (paper.status === 'ready' && paper.summary_status === 'completed') return 'read_now'
  if (paper.status === 'parse_failed' || paper.status === 'summarize_failed' || paper.parse_status === 'failed') return 'recover'
  if (paper.parse_status === 'completed' && paper.summary_status !== 'completed') return 'summarize_next'
  return 'process_next'
}

function statusLabel(paper: Paper): string {
  if (paper.status === 'ready') return '已就绪'
  if (paper.status === 'parsed') return '已解析'
  if (paper.status === 'parse_failed') return '解析失败'
  if (paper.status === 'summarize_failed') return '摘要失败'
  if (paper.status === 'parsing') return '解析中'
  if (paper.status === 'summarizing') return '摘要中'
  return '待处理'
}

function actionLabel(paper: Paper): string {
  const category = categoryForPaper(paper)
  if (category === 'read_now') return '开始阅读'
  if (category === 'summarize_next') return '生成摘要'
  if (category === 'recover') return '查看并重试'
  return '打开处理'
}

function actionHint(paper: Paper): string {
  const category = categoryForPaper(paper)
  if (category === 'read_now') return '已有摘要和状态信号，适合作为当前阅读入口。'
  if (category === 'summarize_next') return '正文已解析完成，补齐摘要后推荐质量会明显提高。'
  if (category === 'recover') return '处理流程失败，建议先进入详情页修复，避免漏掉潜在重要论文。'
  return '论文仍在队列或处理中，进入详情页可以查看当前进度。'
}

function reasonForPaper(paper: Paper): string {
  const category = categoryForPaper(paper)
  if (category === 'read_now') {
    return paper.tags?.length
      ? `已完成摘要，并带有“${paper.tags.slice(0, 2).join('、')}”标签，适合优先阅读。`
      : '已完成解析和摘要，信息完整度高，适合作为当前阅读对象。'
  }
  if (category === 'summarize_next') return '正文已解析但缺少中文摘要，补齐后能更快判断是否值得深读。'
  if (category === 'recover') return '处理流程失败但仍保留候选信息，建议先修复再进入阅读队列。'
  return '论文已进入处理流程，可作为下一批推进对象。'
}

function futureDirectionForPaper(paper: Paper): string {
  if (paper.tags?.length) return `可围绕“${paper.tags.slice(0, 2).join('、')}”继续检索相邻主题论文。`
  const category = categoryForPaper(paper)
  if (category === 'read_now') return '阅读后补充标签和主分类，后续推荐会更贴近你的研究方向。'
  if (category === 'summarize_next') return '生成摘要后再做语义检索，判断它与已读论文的关系。'
  if (category === 'recover') return '先完成修复，再纳入每日速览或语义推荐链路。'
  return '完成解析和摘要后，推荐系统会给出更具体的研究价值判断。'
}

function signalsForPaper(paper: Paper): string[] {
  const signals = [statusLabel(paper)]
  if (paper.summary_status === 'completed') signals.push('已有中文摘要')
  if (paper.parse_status === 'completed' && paper.summary_status !== 'completed') signals.push('适合补摘要')
  if (paper.category_status === 'manual_locked') signals.push('人工确认分类')
  if ((paper.category_confidence ?? 0) >= 0.85) signals.push('分类置信度高')
  if (paper.tags?.length) signals.push(`标签：${paper.tags.slice(0, 2).join('、')}`)
  return signals
}

function scoreBreakdownForPaper(paper: Paper): string[] {
  const items = [statusLabel(paper)]
  if (paper.summary_status === 'completed') items.push('摘要完成加权')
  if (paper.parse_status === 'completed' && paper.summary_status !== 'completed') items.push('待补摘要加权')
  if (paper.category_status === 'manual_locked') items.push('人工确认加权')
  if (paper.tags?.length) items.push('标签信号加权')
  return items
}

function confidenceFromScore(score: number): number {
  if (score >= 180) return 96
  if (score >= 140) return 88
  if (score >= 100) return 76
  if (score >= 70) return 62
  return 48
}

function iconForCategory(category: string): IconName {
  if (category === 'read_now') return 'target'
  if (category === 'summarize_next') return 'spark'
  if (category === 'recover') return 'warning'
  return 'fileText'
}

function iconName(value?: string): IconName {
  if (value === 'target' || value === 'spark' || value === 'warning' || value === 'vector' || value === 'fileText') {
    return value
  }
  return 'fileText'
}
