import { useHealthCheck } from './useHealthCheck'

/**
 * Banner shown when the embedding feature is unavailable.
 *
 * In desktop packaged mode, sentence-transformers is excluded to keep
 * the bundle size under ~200MB. This banner explains the situation
 * and tells users how to enable embedding if they need it.
 */
export function EmbeddingUnavailableNotice() {
  const { health, isLoading } = useHealthCheck()

  // Only show the notice when we know embedding is unavailable
  if (isLoading || health === null || health.embedding_available) {
    return null
  }

  return (
    <div
      className="embedding-unavailable-notice"
      role="status"
      style={{
        padding: '10px 16px',
        marginBottom: '12px',
        borderRadius: '8px',
        border: '1px solid rgba(234, 179, 8, 0.3)',
        background: 'rgba(234, 179, 8, 0.08)',
        color: 'var(--color-text, #e5e5e5)',
        fontSize: '14px',
        lineHeight: '1.5',
      }}
    >
      <strong>向量化功能不可用</strong>
      <p style={{ margin: '4px 0 0', opacity: 0.85 }}>
        桌面版未包含 Embedding 模型（sentence-transformers），语义搜索和向量化功能暂不可用。
        如需启用，请在后端环境安装：
        <code style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '13px',
        }}>
          pip install sentence-transformers
        </code>
        然后重启应用。
      </p>
    </div>
  )
}