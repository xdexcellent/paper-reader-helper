import { Icon } from './UiIcon'

const AVAILABLE_MODELS = [
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2',
] as const

export function PaperActions({
  disabled,
  isRunningParse,
  isRunningSummarize,
  isRunningEmbed,
  selectedModel,
  onModelChange,
  onParse,
  onSummarize,
  onEmbed,
  onRefresh,
}: {
  disabled: boolean
  isRunningParse: boolean
  isRunningSummarize: boolean
  isRunningEmbed: boolean
  selectedModel: string
  onModelChange: (model: string) => void
  onParse: () => Promise<void>
  onSummarize: () => Promise<void>
  onEmbed: () => Promise<void>
  onRefresh: () => Promise<void>
}) {
  return (
    <div className="paper-actions-bar">
      <span className="actions-label">操作</span>

      <button
        id="btn-parse"
        type="button"
        aria-label="解析"
        disabled={disabled || isRunningParse}
        onClick={() => void onParse()}
        className="btn btn-action btn-parse"
      >
        {isRunningParse ? (
          <><span className="spinner" />解析中...</>
        ) : (
          <><Icon name="fileText" />解析</>
        )}
      </button>

      <div className="model-selector-group">
        <select
          id="model-select"
          className="model-select"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled || isRunningSummarize}
          aria-label="选择模型"
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <button
        id="btn-summarize"
        type="button"
        aria-label="生成摘要"
        disabled={disabled || isRunningSummarize}
        onClick={() => void onSummarize()}
        className="btn btn-action btn-summarize"
      >
        {isRunningSummarize ? (
          <><span className="spinner" />生成中...</>
        ) : (
          <><Icon name="spark" />生成摘要</>
        )}
      </button>

      <button
        id="btn-embed"
        type="button"
        aria-label="生成语义向量"
        disabled={disabled || isRunningEmbed}
        onClick={() => void onEmbed()}
        className="btn btn-action btn-embed"
        title="生成用于语义检索的向量"
      >
        {isRunningEmbed ? (
          <><span className="spinner" />生成中...</>
        ) : (
          <><Icon name="vector" />向量化</>
        )}
      </button>

      <div className="actions-spacer" />

      <button
        id="btn-refresh"
        type="button"
        disabled={disabled}
        onClick={() => void onRefresh()}
        className="btn btn-action btn-refresh"
        title="刷新当前论文数据"
      >
        <Icon name="refresh" />
        刷新
      </button>
    </div>
  )
}
