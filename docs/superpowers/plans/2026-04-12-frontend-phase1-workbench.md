# 前端 Phase 1 浅色可操作工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前深色静态阅读页升级为浅色可操作工作台，支持导入 PDF、手动解析、手动生成摘要、基础反馈与正文阅读。

**Architecture:** 保留现有双栏工作台结构，在左侧补导入表单，在右侧补操作条与反馈区。前端继续使用 React `useState` 管理状态，不引入新依赖；所有写操作完成后统一刷新列表与当前详情，避免本地状态推导失真。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、React Testing Library

---

## 范围说明

本计划只覆盖 `docs/superpowers/specs/2026-04-12-frontend-phase1-workbench-design.md` 中的 **Phase 1**：
- 浅色 UI
- 导入表单
- 手动解析
- 手动生成摘要
- 刷新详情
- 空态 / 成功提示 / 错误提示 / 加载态

本计划明确不包含：
- 文件上传控件
- 搜索 / 筛选 / 排序
- 章节导航
- 拖拽上传
- 自动串行处理
- 新状态库 / UI 库

> 说明：根据当前协作约束，本计划**不包含 git 提交/分支步骤**。

---

## 文件结构

### 前端
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/PaperList.tsx`
- Modify: `frontend/src/components/PaperDetail.tsx`
- Modify: `frontend/src/components/SummaryCard.tsx`
- Modify: `frontend/src/components/StatusBadge.tsx`
- Create: `frontend/src/components/ImportForm.tsx`
- Create: `frontend/src/components/PaperActions.tsx`
- Create: `frontend/src/components/FeedbackBanner.tsx`

---

### Task 1: 扩展 API 契约并锁定空态与浅色工作台骨架

**Files:**
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/PaperDetail.tsx`
- Modify: `frontend/src/components/PaperList.tsx`
- Modify: `frontend/src/components/SummaryCard.tsx`
- Modify: `frontend/src/components/StatusBadge.tsx`

- [ ] **Step 1: 先写失败测试，锁定空态与浅色标题区**

```tsx
// frontend/src/App.test.tsx
// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import App from './App'

const fetchPapers = vi.fn()
const fetchPaperDetail = vi.fn()
const importPaper = vi.fn()
const parsePaper = vi.fn()
const summarizePaper = vi.fn()

vi.mock('./lib/api', () => ({
  fetchPapers,
  fetchPaperDetail,
  importPaper,
  parsePaper,
  summarizePaper,
}))

test('初始渲染时显示浅色工作台标题与空态提示', async () => {
  fetchPapers.mockResolvedValueOnce([])

  render(<App />)

  expect(await screen.findByText('论文工作台')).toBeInTheDocument()
  expect(screen.getByText('还没有论文，请先导入')).toBeInTheDocument()
  expect(screen.getByText('请选择左侧论文，或先导入新论文')).toBeInTheDocument()
})

test('点击列表项后继续显示摘要与正文', async () => {
  fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
    },
  ])
  fetchPaperDetail.mockResolvedValueOnce({
    id: 1,
    title: 'Reader Ready',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/sample.pdf',
    full_markdown: '# Reader Ready\n\n正文内容',
    abstract_md: '摘要章节',
    introduction_md: '引言章节',
    method_md: '方法章节',
    conclusion_md: '结论章节',
    one_line_summary: '一句话摘要',
    core_contributions: '核心贡献',
    method_summary: '方法概述',
    use_cases: '应用场景',
    limitations: '局限性',
    relevance_note: '相关性',
  })

  render(<App />)

  fireEvent.click(await screen.findByText('Reader Ready'))

  expect(await screen.findByText('一句话摘要')).toBeInTheDocument()
  expect(screen.getByText('正文内容')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试，确认当前实现还没有导入空态与新标题**

Run: `cd frontend && npm test -- --run`
Expected: FAIL，报找不到“论文工作台”或空态文案不匹配

- [ ] **Step 3: 扩展类型与 API 契约，为后续导入/动作接口准备最小模型**

```tsx
// frontend/src/types.ts
export type Paper = {
  id: number
  title: string
  source: string
  status: string
  parse_status: string
  summary_status: string
  embedding_status: string
  local_pdf_path: string
}

export type PaperDetail = Paper & {
  full_markdown: string
  abstract_md: string
  introduction_md: string
  method_md: string
  conclusion_md: string
  one_line_summary: string
  core_contributions: string
  method_summary: string
  use_cases: string
  limitations: string
  relevance_note: string
}

export type PaperImportRequest = {
  title: string
  source: string
  local_pdf_path: string
}
```

```tsx
// frontend/src/lib/api.ts
import type { Paper, PaperDetail, PaperImportRequest } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = '请求失败，请稍后重试'
    try {
      const payload = await response.json()
      message = payload.detail ?? message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export async function fetchPapers(): Promise<Paper[]> {
  const response = await fetch(`${API_BASE}/papers`)
  return readJson<Paper[]>(response)
}

export async function fetchPaperDetail(id: number): Promise<PaperDetail> {
  const response = await fetch(`${API_BASE}/papers/${id}`)
  return readJson<PaperDetail>(response)
}

export async function importPaper(payload: PaperImportRequest): Promise<Paper> {
  const response = await fetch(`${API_BASE}/papers/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<Paper>(response)
}

export async function parsePaper(id: number): Promise<Paper> {
  const response = await fetch(`${API_BASE}/papers/${id}/parse`, {
    method: 'POST',
  })
  return readJson<Paper>(response)
}

export async function summarizePaper(id: number): Promise<Paper> {
  const response = await fetch(`${API_BASE}/papers/${id}/summarize`, {
    method: 'POST',
  })
  return readJson<Paper>(response)
}
```

- [ ] **Step 4: 先把现有页面调成浅色工作台骨架，并补齐空态文案**

```tsx
// frontend/src/components/PaperDetail.tsx
import type { PaperDetail as PaperDetailType } from '../types'
import { SummaryCard } from './SummaryCard'

export function PaperDetail({ paper }: { paper: PaperDetailType | null }) {
  if (!paper) {
    return (
      <div
        style={{
          borderRadius: 16,
          border: '1px solid #e5e7eb',
          background: '#ffffff',
          padding: 24,
          color: '#374151',
        }}
      >
        请选择左侧论文，或先导入新论文
      </div>
    )
  }

  const bodyText = paper.full_markdown.replace(/^# .*\n\n/, '')

  return (
    <article style={{ display: 'grid', gap: 20 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 28, color: '#111827' }}>{paper.title}</h1>
      </header>

      <SummaryCard
        oneLineSummary={paper.one_line_summary}
        coreContributions={paper.core_contributions}
        methodSummary={paper.method_summary}
        limitations={paper.limitations}
        relevanceNote={paper.relevance_note}
      />

      <section
        style={{
          borderRadius: 16,
          border: '1px solid #e5e7eb',
          background: '#ffffff',
          padding: 24,
          color: '#111827',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>正文</h2>
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            lineHeight: 1.8,
          }}
        >
          {bodyText}
        </pre>
      </section>
    </article>
  )
}
```

```tsx
// frontend/src/components/PaperList.tsx
import type { Paper } from '../types'
import { StatusBadge } from './StatusBadge'

export function PaperList({
  papers,
  selectedPaperId,
  onSelect,
}: {
  papers: Paper[]
  selectedPaperId: number | null
  onSelect: (paper: Paper) => void
}) {
  if (papers.length === 0) {
    return <div style={{ color: '#6b7280' }}>还没有论文，请先导入</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {papers.map((paper) => {
        const isSelected = selectedPaperId === paper.id

        return (
          <button
            key={paper.id}
            type="button"
            onClick={() => onSelect(paper)}
            style={{
              width: '100%',
              textAlign: 'left',
              border: isSelected ? '1px solid #2563eb' : '1px solid #e5e7eb',
              borderRadius: 16,
              padding: '14px 16px',
              background: isSelected ? '#eff6ff' : '#ffffff',
              color: '#111827',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{paper.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>{paper.source}</span>
              <StatusBadge value={paper.status} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

```tsx
// frontend/src/components/SummaryCard.tsx
export function SummaryCard({
  oneLineSummary,
  coreContributions,
  methodSummary,
  limitations,
  relevanceNote,
}: {
  oneLineSummary: string
  coreContributions: string
  methodSummary: string
  limitations: string
  relevanceNote: string
}) {
  return (
    <section
      style={{
        borderRadius: 16,
        border: '1px solid #dbeafe',
        background: '#f8fbff',
        padding: 24,
        color: '#1f2937',
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#2563eb' }}>
        AI 摘要
      </div>
      <h2 style={{ margin: '10px 0 14px', fontSize: 24, lineHeight: 1.3 }}>{oneLineSummary || '暂无摘要'}</h2>
      <div style={{ display: 'grid', gap: 10, color: '#374151', lineHeight: 1.7 }}>
        <p><strong>核心贡献：</strong>{coreContributions || '暂无内容'}</p>
        <p><strong>方法概述：</strong>{methodSummary || '暂无内容'}</p>
        <p><strong>局限性：</strong>{limitations || '暂无内容'}</p>
        <p><strong>相关性：</strong>{relevanceNote || '暂无内容'}</p>
      </div>
    </section>
  )
}
```

```tsx
// frontend/src/components/StatusBadge.tsx
export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#1d4ed8',
        background: '#dbeafe',
        border: '1px solid #bfdbfe',
      }}
    >
      {value}
    </span>
  )
}
```

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from 'react'

import { PaperDetail } from './components/PaperDetail'
import { PaperList } from './components/PaperList'
import { fetchPaperDetail, fetchPapers } from './lib/api'
import type { Paper, PaperDetail as PaperDetailType } from './types'

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PaperDetailType | null>(null)

  useEffect(() => {
    fetchPapers().then(setPapers)
  }, [])

  async function handleSelect(paper: Paper) {
    setSelectedPaperId(paper.id)
    const nextDetail = await fetchPaperDetail(paper.id)
    setDetail(nextDetail)
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '360px minmax(0, 1fr)',
        gap: 24,
        padding: 24,
        background: '#f3f4f6',
        color: '#111827',
      }}
    >
      <aside style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>论文工作台</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>导入、处理并阅读你的论文</p>
        </div>
        <PaperList papers={papers} selectedPaperId={selectedPaperId} onSelect={handleSelect} />
      </aside>

      <section>
        <PaperDetail paper={detail} />
      </section>
    </main>
  )
}
```

- [ ] **Step 5: 重新运行测试，确认空态与浅色骨架成立**

Run: `cd frontend && npm test -- --run`
Expected: PASS，输出 `2 passed`

---

### Task 2: 增加导入表单并在导入成功后自动选中新论文

**Files:**
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/ImportForm.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: 先写失败测试，锁定导入后自动选中与详情刷新**

```tsx
// frontend/src/App.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// 追加到现有测试文件

test('导入成功后刷新列表并自动选中新论文', async () => {
  fetchPapers
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        id: 2,
        title: 'New Paper',
        source: 'manual',
        status: 'queued',
        parse_status: 'pending',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/new.pdf',
      },
    ])
  importPaper.mockResolvedValueOnce({
    id: 2,
    title: 'New Paper',
    source: 'manual',
    status: 'queued',
    parse_status: 'pending',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/new.pdf',
  })
  fetchPaperDetail.mockResolvedValueOnce({
    id: 2,
    title: 'New Paper',
    source: 'manual',
    status: 'queued',
    parse_status: 'pending',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/new.pdf',
    full_markdown: '# New Paper\n\n正文内容',
    abstract_md: '',
    introduction_md: '',
    method_md: '',
    conclusion_md: '',
    one_line_summary: '',
    core_contributions: '',
    method_summary: '',
    use_cases: '',
    limitations: '',
    relevance_note: '',
  })

  render(<App />)

  fireEvent.change(screen.getByLabelText('论文标题'), { target: { value: 'New Paper' } })
  fireEvent.change(screen.getByLabelText('来源'), { target: { value: 'manual' } })
  fireEvent.change(screen.getByLabelText('PDF 路径'), { target: { value: '/tmp/new.pdf' } })
  fireEvent.click(screen.getByRole('button', { name: '导入' }))

  await waitFor(() => {
    expect(importPaper).toHaveBeenCalledWith({
      title: 'New Paper',
      source: 'manual',
      local_pdf_path: '/tmp/new.pdf',
    })
  })

  expect(await screen.findByText('New Paper')).toBeInTheDocument()
  expect(await screen.findByText('导入成功')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试，确认当前还没有导入表单与导入流程**

Run: `cd frontend && npm test -- --run`
Expected: FAIL，报找不到“论文标题”输入框或 `importPaper` 未被调用

- [ ] **Step 3: 创建最小导入表单组件**

```tsx
// frontend/src/components/ImportForm.tsx
import { useState } from 'react'

import type { PaperImportRequest } from '../types'

export function ImportForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (payload: PaperImportRequest) => Promise<void>
  isSubmitting: boolean
}) {
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('manual')
  const [localPdfPath, setLocalPdfPath] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit({
      title,
      source,
      local_pdf_path: localPdfPath,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gap: 12,
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        background: '#ffffff',
        padding: 16,
      }}
    >
      <label style={{ display: 'grid', gap: 6 }}>
        <span>论文标题</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>来源</span>
        <input value={source} onChange={(event) => setSource(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>PDF 路径</span>
        <input value={localPdfPath} onChange={(event) => setLocalPdfPath(event.target.value)} />
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          border: 'none',
          borderRadius: 10,
          padding: '10px 14px',
          background: '#2563eb',
          color: '#ffffff',
          cursor: 'pointer',
        }}
      >
        {isSubmitting ? '导入中...' : '导入'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: 在 App 中接入导入成功后刷新列表并自动选中逻辑**

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from 'react'

import { ImportForm } from './components/ImportForm'
import { PaperDetail } from './components/PaperDetail'
import { PaperList } from './components/PaperList'
import { fetchPaperDetail, fetchPapers, importPaper } from './lib/api'
import type { Paper, PaperDetail as PaperDetailType, PaperImportRequest } from './types'

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PaperDetailType | null>(null)
  const [isSubmittingImport, setIsSubmittingImport] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function refreshPapers() {
    const nextPapers = await fetchPapers()
    setPapers(nextPapers)
    return nextPapers
  }

  async function loadPaperDetail(paperId: number) {
    setSelectedPaperId(paperId)
    const nextDetail = await fetchPaperDetail(paperId)
    setDetail(nextDetail)
  }

  useEffect(() => {
    refreshPapers()
  }, [])

  async function handleSelect(paper: Paper) {
    await loadPaperDetail(paper.id)
  }

  async function handleImport(payload: PaperImportRequest) {
    setIsSubmittingImport(true)
    setErrorMessage('')
    setFeedbackMessage('')

    try {
      const createdPaper = await importPaper(payload)
      await refreshPapers()
      await loadPaperDetail(createdPaper.id)
      setFeedbackMessage('导入成功')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导入失败，请稍后重试')
    } finally {
      setIsSubmittingImport(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '360px minmax(0, 1fr)',
        gap: 24,
        padding: 24,
        background: '#f3f4f6',
        color: '#111827',
      }}
    >
      <aside style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>论文工作台</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>导入、处理并阅读你的论文</p>
        </div>
        <ImportForm onSubmit={handleImport} isSubmitting={isSubmittingImport} />
        <PaperList papers={papers} selectedPaperId={selectedPaperId} onSelect={handleSelect} />
      </aside>

      <section>
        {feedbackMessage ? <div style={{ marginBottom: 12, color: '#166534' }}>{feedbackMessage}</div> : null}
        {errorMessage ? <div style={{ marginBottom: 12, color: '#b91c1c' }}>{errorMessage}</div> : null}
        <PaperDetail paper={detail} />
      </section>
    </main>
  )
}
```

- [ ] **Step 5: 重新运行测试，确认导入闭环成立**

Run: `cd frontend && npm test -- --run`
Expected: PASS，输出 `3 passed`

---

### Task 3: 增加操作条，支持手动解析、摘要与详情刷新

**Files:**
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/PaperActions.tsx`
- Modify: `frontend/src/components/PaperDetail.tsx`

- [ ] **Step 1: 先写失败测试，锁定解析与摘要按钮行为**

```tsx
// frontend/src/App.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// 追加到现有测试文件

test('点击解析与生成摘要后调用对应 API 并刷新详情', async () => {
  fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'parsed',
      parse_status: 'completed',
      summary_status: 'pending',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
    },
  ])
  fetchPaperDetail
    .mockResolvedValueOnce({
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'parsed',
      parse_status: 'completed',
      summary_status: 'pending',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      full_markdown: '# Reader Ready\n\n正文内容',
      abstract_md: '',
      introduction_md: '',
      method_md: '',
      conclusion_md: '',
      one_line_summary: '',
      core_contributions: '',
      method_summary: '',
      use_cases: '',
      limitations: '',
      relevance_note: '',
    })
    .mockResolvedValueOnce({
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      full_markdown: '# Reader Ready\n\n正文内容',
      abstract_md: '摘要章节',
      introduction_md: '引言章节',
      method_md: '方法章节',
      conclusion_md: '结论章节',
      one_line_summary: '一句话摘要',
      core_contributions: '核心贡献',
      method_summary: '方法概述',
      use_cases: '应用场景',
      limitations: '局限性',
      relevance_note: '相关性',
    })
    .mockResolvedValueOnce({
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      full_markdown: '# Reader Ready\n\n正文内容',
      abstract_md: '摘要章节',
      introduction_md: '引言章节',
      method_md: '方法章节',
      conclusion_md: '结论章节',
      one_line_summary: '一句话摘要',
      core_contributions: '核心贡献',
      method_summary: '方法概述',
      use_cases: '应用场景',
      limitations: '局限性',
      relevance_note: '相关性',
    })

  parsePaper.mockResolvedValueOnce({ id: 1 })
  summarizePaper.mockResolvedValueOnce({ id: 1 })

  render(<App />)

  fireEvent.click(await screen.findByText('Reader Ready'))
  fireEvent.click(await screen.findByRole('button', { name: '解析' }))
  fireEvent.click(await screen.findByRole('button', { name: '生成摘要' }))

  await waitFor(() => expect(parsePaper).toHaveBeenCalledWith(1))
  await waitFor(() => expect(summarizePaper).toHaveBeenCalledWith(1))
  expect(await screen.findByText('一句话摘要')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试，确认当前还没有操作条组件**

Run: `cd frontend && npm test -- --run`
Expected: FAIL，报找不到“解析”或“生成摘要”按钮

- [ ] **Step 3: 创建最小操作条组件**

```tsx
// frontend/src/components/PaperActions.tsx
export function PaperActions({
  disabled,
  isRunningParse,
  isRunningSummarize,
  onParse,
  onSummarize,
  onRefresh,
}: {
  disabled: boolean
  isRunningParse: boolean
  isRunningSummarize: boolean
  onParse: () => Promise<void>
  onSummarize: () => Promise<void>
  onRefresh: () => Promise<void>
}) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <button type="button" disabled={disabled || isRunningParse} onClick={() => void onParse()}>
        {isRunningParse ? '解析中...' : '解析'}
      </button>
      <button type="button" disabled={disabled || isRunningSummarize} onClick={() => void onSummarize()}>
        {isRunningSummarize ? '生成中...' : '生成摘要'}
      </button>
      <button type="button" disabled={disabled} onClick={() => void onRefresh()}>
        刷新
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 在 App 中接入解析/摘要/刷新逻辑**

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from 'react'

import { FeedbackBanner } from './components/FeedbackBanner'
import { ImportForm } from './components/ImportForm'
import { PaperActions } from './components/PaperActions'
import { PaperDetail } from './components/PaperDetail'
import { PaperList } from './components/PaperList'
import {
  fetchPaperDetail,
  fetchPapers,
  importPaper,
  parsePaper,
  summarizePaper,
} from './lib/api'
import type { Paper, PaperDetail as PaperDetailType, PaperImportRequest } from './types'

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PaperDetailType | null>(null)
  const [isSubmittingImport, setIsSubmittingImport] = useState(false)
  const [isRunningParse, setIsRunningParse] = useState(false)
  const [isRunningSummarize, setIsRunningSummarize] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function refreshPapers() {
    const nextPapers = await fetchPapers()
    setPapers(nextPapers)
    return nextPapers
  }

  async function loadPaperDetail(paperId: number) {
    setSelectedPaperId(paperId)
    const nextDetail = await fetchPaperDetail(paperId)
    setDetail(nextDetail)
  }

  useEffect(() => {
    refreshPapers()
  }, [])

  async function handleSelect(paper: Paper) {
    await loadPaperDetail(paper.id)
  }

  async function handleImport(payload: PaperImportRequest) {
    setIsSubmittingImport(true)
    setErrorMessage('')
    setFeedbackMessage('')

    try {
      const createdPaper = await importPaper(payload)
      await refreshPapers()
      await loadPaperDetail(createdPaper.id)
      setFeedbackMessage('导入成功')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导入失败，请稍后重试')
    } finally {
      setIsSubmittingImport(false)
    }
  }

  async function handleRefresh() {
    if (selectedPaperId === null) return
    setErrorMessage('')

    try {
      await loadPaperDetail(selectedPaperId)
      await refreshPapers()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '刷新失败，请稍后重试')
    }
  }

  async function handleParse() {
    if (selectedPaperId === null) return
    setIsRunningParse(true)
    setErrorMessage('')
    setFeedbackMessage('')

    try {
      await parsePaper(selectedPaperId)
      await refreshPapers()
      await loadPaperDetail(selectedPaperId)
      setFeedbackMessage('解析完成')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '解析失败，请稍后重试')
    } finally {
      setIsRunningParse(false)
    }
  }

  async function handleSummarize() {
    if (selectedPaperId === null) return
    setIsRunningSummarize(true)
    setErrorMessage('')
    setFeedbackMessage('')

    try {
      await summarizePaper(selectedPaperId)
      await refreshPapers()
      await loadPaperDetail(selectedPaperId)
      setFeedbackMessage('摘要生成完成')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '摘要生成失败，请稍后重试')
    } finally {
      setIsRunningSummarize(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '360px minmax(0, 1fr)',
        gap: 24,
        padding: 24,
        background: '#f3f4f6',
        color: '#111827',
      }}
    >
      <aside style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>论文工作台</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>导入、处理并阅读你的论文</p>
        </div>
        <ImportForm onSubmit={handleImport} isSubmitting={isSubmittingImport} />
        <PaperList papers={papers} selectedPaperId={selectedPaperId} onSelect={handleSelect} />
      </aside>

      <section>
        <PaperActions
          disabled={selectedPaperId === null}
          isRunningParse={isRunningParse}
          isRunningSummarize={isRunningSummarize}
          onParse={handleParse}
          onSummarize={handleSummarize}
          onRefresh={handleRefresh}
        />
        <FeedbackBanner feedbackMessage={feedbackMessage} errorMessage={errorMessage} />
        <PaperDetail paper={detail} />
      </section>
    </main>
  )
}
```

- [ ] **Step 5: 重新运行测试，确认操作闭环成立**

Run: `cd frontend && npm test -- --run`
Expected: PASS，输出 `4 passed`

---

### Task 4: 增加统一反馈组件并锁定错误提示与保留输入行为

**Files:**
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/FeedbackBanner.tsx`
- Modify: `frontend/src/components/ImportForm.tsx`

- [ ] **Step 1: 先写失败测试，锁定导入失败时错误提示与输入保留**

```tsx
// frontend/src/App.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// 追加到现有测试文件

test('导入失败时显示错误提示并保留表单输入', async () => {
  fetchPapers.mockResolvedValueOnce([])
  importPaper.mockRejectedValueOnce(new Error('PDF 文件不存在'))

  render(<App />)

  fireEvent.change(screen.getByLabelText('论文标题'), { target: { value: 'Bad Paper' } })
  fireEvent.change(screen.getByLabelText('来源'), { target: { value: 'manual' } })
  fireEvent.change(screen.getByLabelText('PDF 路径'), { target: { value: '/tmp/missing.pdf' } })
  fireEvent.click(screen.getByRole('button', { name: '导入' }))

  expect(await screen.findByText('PDF 文件不存在')).toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByLabelText('论文标题')).toHaveValue('Bad Paper')
    expect(screen.getByLabelText('PDF 路径')).toHaveValue('/tmp/missing.pdf')
  })
})
```

- [ ] **Step 2: 运行测试，确认当前还没有统一反馈组件或输入保留逻辑未锁定**

Run: `cd frontend && npm test -- --run`
Expected: FAIL，报错误文案未显示或输入框状态与预期不符

- [ ] **Step 3: 创建统一反馈组件**

```tsx
// frontend/src/components/FeedbackBanner.tsx
export function FeedbackBanner({
  feedbackMessage,
  errorMessage,
}: {
  feedbackMessage: string
  errorMessage: string
}) {
  if (!feedbackMessage && !errorMessage) {
    return null
  }

  if (errorMessage) {
    return (
      <div
        style={{
          marginBottom: 12,
          borderRadius: 12,
          border: '1px solid #fecaca',
          background: '#fef2f2',
          padding: 12,
          color: '#b91c1c',
        }}
      >
        {errorMessage}
      </div>
    )
  }

  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 12,
        border: '1px solid #bbf7d0',
        background: '#f0fdf4',
        padding: 12,
        color: '#166534',
      }}
    >
      {feedbackMessage}
    </div>
  )
}
```

- [ ] **Step 4: 明确保留表单输入，不在失败时重置组件状态，并接入统一反馈组件**

```tsx
// frontend/src/components/ImportForm.tsx
import { useState } from 'react'

import type { PaperImportRequest } from '../types'

export function ImportForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (payload: PaperImportRequest) => Promise<void>
  isSubmitting: boolean
}) {
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('manual')
  const [localPdfPath, setLocalPdfPath] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit({
      title,
      source,
      local_pdf_path: localPdfPath,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gap: 12,
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        background: '#ffffff',
        padding: 16,
      }}
    >
      <label style={{ display: 'grid', gap: 6 }}>
        <span>论文标题</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>来源</span>
        <input value={source} onChange={(event) => setSource(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>PDF 路径</span>
        <input value={localPdfPath} onChange={(event) => setLocalPdfPath(event.target.value)} />
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          border: 'none',
          borderRadius: 10,
          padding: '10px 14px',
          background: '#2563eb',
          color: '#ffffff',
          cursor: 'pointer',
        }}
      >
        {isSubmitting ? '导入中...' : '导入'}
      </button>
    </form>
  )
}
```

```tsx
// frontend/src/App.tsx
// 保持 Task 3 的结构，仅确保使用 <FeedbackBanner />，
// 导入失败时只设置 errorMessage，不重置 ImportForm 内部状态。
```

- [ ] **Step 5: 重新运行测试，确认错误反馈成立**

Run: `cd frontend && npm test -- --run`
Expected: PASS，输出 `5 passed`

---

### Task 5: 全量回归并完成 Phase 1 验收

**Files:**
- Test: `frontend/src/App.test.tsx`
- Verify: `frontend/src/App.tsx`
- Verify: `frontend/src/components/ImportForm.tsx`
- Verify: `frontend/src/components/PaperActions.tsx`
- Verify: `frontend/src/components/FeedbackBanner.tsx`
- Verify: `frontend/src/components/PaperList.tsx`
- Verify: `frontend/src/components/PaperDetail.tsx`
- Verify: `frontend/src/components/SummaryCard.tsx`
- Verify: `frontend/src/components/StatusBadge.tsx`
- Verify: `frontend/src/lib/api.ts`
- Verify: `frontend/src/types.ts`

- [ ] **Step 1: 运行前端测试，确认所有交互测试通过**

Run: `cd frontend && npm test -- --run`
Expected: PASS，输出 `5 passed`

- [ ] **Step 2: 运行前端构建，确认 TypeScript 与 Vite 构建无误**

Run: `cd frontend && npm run build`
Expected: PASS，输出 `vite build` 完成且无 TypeScript 错误

- [ ] **Step 3: 若容器仍在运行，手动打开页面进行视觉验收**

Run: `curl -I http://localhost:3000`
Expected: PASS，返回 `HTTP/1.1 200 OK`

人工验收点：
- 页面整体为浅色
- 左侧可看到导入表单
- 左侧列表为空时能看到空态
- 右侧未选中论文时能看到空态
- 选中论文后仍能看到摘要与正文
- 右侧可见“解析 / 生成摘要 / 刷新”按钮

---

## 验证顺序

按以下顺序执行，不要跳步：
1. `cd frontend && npm test -- --run`
2. `cd frontend && npm test -- --run`
3. `cd frontend && npm test -- --run`
4. `cd frontend && npm test -- --run`
5. `cd frontend && npm run build`
6. `curl -I http://localhost:3000`

---

## 交付完成标准

完成本计划后，应满足以下验收条件：
- 页面改为浅色简洁工作台，而不是通篇深色
- 左侧可直接填写标题、来源、PDF 路径并执行导入
- 导入成功后自动刷新列表并选中新论文
- 右侧可对当前论文执行解析、生成摘要、刷新
- 页面具备空态、成功提示、错误提示、按钮加载态
- 原有“点击论文显示摘要与正文”阅读能力不回退
- 前端测试与构建都通过
