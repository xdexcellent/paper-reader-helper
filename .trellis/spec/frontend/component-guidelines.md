# 前端组件开发规范

> 项目前端采用 React 18 + TypeScript + 纯 CSS（无组件库/无 Tailwind），使用 CSS 自定义属性实现暗色/亮色主题。

---

## 1. 组件命名与文件组织

**规则**:
- 每个组件一个 `.tsx` 文件
- 页面级组件放在对应功能目录：`src/components/<功能域>/`
- 通用 UI 组件放在 `src/components/` 根目录
- Props 类型定义在组件文件内（非 `types.ts` 通用类型除外）

**示例**:
```
src/components/
├── Drawer.tsx              # 通用 UI 组件
├── UiIcon.tsx              # 通用 UI 组件
├── StatusBadge.tsx         # 通用 UI 组件
├── reader/                 # 阅读器功能域
│   ├── ReaderPage.tsx
│   ├── ReaderShell.tsx
│   ├── ReaderToolbar.tsx
│   ├── RightDrawer.tsx
│   └── ...
└── library/                # 论文管理功能域
    ├── LibraryPage.tsx
    ├── PaperLibraryList.tsx
    └── ...
```

---

## 2. Drawer 组件契约

**Location**: `src/components/Drawer.tsx`

```typescript
type DrawerProps = {
  isOpen: boolean
  onClose: () => void
  width?: number                    // 默认 380px
  title?: string
  tabs?: { key: string; label: string }[]  // 可选 Tab 导航
  children: ReactNode
}
```

**行为**:
- `position: fixed; top: 0; right: 0; height: 100vh`
- 收起: `transform: translateX(100%)`
- 展开: `transform: translateX(0)`，transition: `0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- z-index: panel 801，overlay 800
- 使用项目 CSS 变量: `--bg-panel`, `--border-subtle`, `--shadow-hover`

**使用示例**:
```tsx
import { Drawer } from '../Drawer'

<Drawer isOpen={open} onClose={() => setOpen(false)} title="AI 辅助" tabs={[
  { key: 'overview', label: '论文概览' },
  { key: 'blocks', label: '结构块' },
  { key: 'notes', label: '笔记' },
]}>
  {activeTab === 'overview' && <OverviewPanel singleColumn />}
  {activeTab === 'blocks' && <BlocksPanel />}
  {activeTab === 'notes' && <NotesPanel />}
</Drawer>
```

---

## 3. Auto-Save Debounce 模式

**场景**: 用户在阅读器改动状态/进度后，自动保存到后端。

**实现合约**:
```typescript
// ReaderPage.tsx 中的模式
const autoSavedRef = useRef(false)
const lastSavedRef = useRef<{ status: ReadingStatus; progress: number } | null>(null)

useEffect(() => {
  // 初始加载时不触发保存
  if (!paper) return
  const payload = { reading_status: readingStatus, reading_progress: readingProgress }
  if (lastSavedRef.current
    && lastSavedRef.current.status === payload.reading_status
    && lastSavedRef.current.progress === payload.reading_progress) return

  autoSavedRef.current = false
  const timer = setTimeout(() => {
    handleReadingStateChange(payload)
    autoSavedRef.current = true
    lastSavedRef.current = payload
  }, 500)
  return () => clearTimeout(timer)
}, [readingStatus, readingProgress])
```

**关键点**:
- `lastSavedRef`: 追踪已保存的值，避免重复保存
- `autoSavedRef`: 驱动 UI 显示 "已自动保存" 状态
- debounce 500ms，组件卸载/依赖变化时清理定时器
- 初始加载（挂载时）不触发保存

---

## 4. SingleColumn 变体模式

**场景**: 同一个组件在不同容器中需要不同布局。例如 `PaperOverviewPanel` 在详情面板中双列，在抽屉中单列。

**实现**:
```typescript
type Props = {
  // ... existing props
  singleColumn?: boolean
}

// 组件内
<div className={`paper-overview-grid${singleColumn ? ' single-column' : ''}`}>
```

**CSS**:
```css
.paper-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.paper-overview-grid.single-column {
  grid-template-columns: 1fr;
}
```

**原则**: 通过 prop + CSS modifier class 控制布局变体，避免创建独立组件。

---

## 5. 三层筛选区布局

**场景**: 论文管理页筛选区。

**结构**:
```
[搜索框]                           ← 第 1 层：独立行
[状态 ▼] [收藏 ▼] [阅读 ▼]        ← 第 2 层：三列 flex 横向排列
[tag1] [tag2] [tag3] ...          ← 第 3 层：标签 pill
```

**CSS 约定**:
```css
.paper-library-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filter-row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
}
.filter-row .library-control {
  flex: 1;
  min-width: 0;
}
```

**原则**: 搜索是输入性质，应独立一行；筛选器是选择性质，可横向排列；标签是辅助过滤。

---

## 6. CSS 变量使用

**禁止硬编码颜色值**，必须使用 CSS 变量:

| 变量 | 用途 |
|------|------|
| `--bg-page` | 页面背景 |
| `--bg-panel` | 面板/卡片背景 |
| `--bg-layer-1`, `--bg-layer-2` | 层级背景 |
| `--bg-selected` | 选中状态背景 |
| `--border-subtle` | 轻边框 |
| `--border-strong` | 强边框 |
| `--text-primary` | 主文字 |
| `--text-secondary` | 次文字 |
| `--text-muted` | 弱文字 |
| `--accent-blue` | 主色调 |
| `--accent-blue-soft` | 主色调（半透明） |
| `--shadow-soft`, `--shadow-hover` | 阴影 |
| `--radius-sm` (8px), `--radius-md` (12px) | 圆角 |

---

## 7. 组件 Props 传递链

**规则**: Props 沿组件树逐层显式传递，不依赖全局 store。

**阅读器数据流**:
```
ReaderPage (状态管理 + API 调用)
  └─ ReaderShell (布局 + drawer 状态)
       ├─ ReaderToolbar (顶部)
       ├─ PdfReaderPane / MarkdownReaderPane (主内容)
       └─ RightDrawer (抽屉)
            ├─ PaperOverviewPanel (单列)
            ├─ ReaderBlocksPanel
            └─ ReaderNotesPanel
```

**Props 类型共享**: `ReaderShell` 通过 `type ReaderShellProps = { ...blockShellProps }` 消费 `useReaderBlocks` hook 的返回类型。
