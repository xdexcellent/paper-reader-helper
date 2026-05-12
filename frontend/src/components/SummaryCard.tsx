import { Icon } from './UiIcon'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

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
  const hasAnyContent = oneLineSummary || coreContributions || methodSummary || limitations || relevanceNote

  if (!hasAnyContent) {
    return (
      <Card className="glass-card ai-summary-card">
        <CardHeader className="pb-2">
          <div className="ai-badge">
            <span className="ai-dot" />
            AI 摘要
          </div>
        </CardHeader>
        <CardContent>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>
            暂无 AI 摘要，请点击"生成摘要"按钮
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="glass-card ai-summary-card">
      <CardHeader className="pb-2">
        <div className="ai-badge">
          <span className="ai-dot" />
          AI 摘要
        </div>
      </CardHeader>
      <CardContent>
        {oneLineSummary && (
          <div className="one-line-summary">
            {oneLineSummary}
          </div>
        )}

        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-item-label contributions">
              <Icon name="target" className="label-icon" />
              核心贡献
            </div>
            <div className="summary-item-content">
              {coreContributions || '暂无内容'}
            </div>
          </div>

          <div className="summary-item">
            <div className="summary-item-label method">
              <Icon name="gear" className="label-icon" />
              方法概述
            </div>
            <div className="summary-item-content">
              {methodSummary || '暂无内容'}
            </div>
          </div>

          <div className="summary-item">
            <div className="summary-item-label limitations">
              <Icon name="warning" className="label-icon" />
              局限性
            </div>
            <div className="summary-item-content">
              {limitations || '暂无内容'}
            </div>
          </div>

          <div className="summary-item">
            <div className="summary-item-label relevance">
              <Icon name="link" className="label-icon" />
              相关性注记
            </div>
            <div className="summary-item-content">
              {relevanceNote || '暂无内容'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
