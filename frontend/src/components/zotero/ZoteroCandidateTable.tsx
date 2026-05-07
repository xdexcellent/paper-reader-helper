import type { ZoteroCandidateResponse } from '../../types'

interface Props {
  candidates: ZoteroCandidateResponse[]
  onSelectionChange: (id: number, selected: boolean) => void
}

export function ZoteroCandidateTable({ candidates, onSelectionChange }: Props) {
  if (candidates.length === 0) {
    return <p style={{ color: 'var(--color-muted, #888)', padding: '1rem' }}>暂无导入候选</p>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="zotero-candidate-table" aria-label="Zotero 导入候选列表">
        <thead>
          <tr>
            <th style={{ width: 40 }}>
              <span className="sr-only">选择</span>
            </th>
            <th>标题</th>
            <th>作者</th>
            <th>年份</th>
            <th>分类</th>
            <th>标签</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.id}>
              <td>
                <input
                  type="checkbox"
                  checked={c.is_selected}
                  onChange={() => onSelectionChange(c.id, !c.is_selected)}
                  aria-label={`${c.is_selected ? '取消选择' : '选择'} ${c.mapped_title}`}
                />
              </td>
              <td>
                {c.mapped_title}
                {c.is_duplicate && (
                  <span className="zotero-badge-duplicate" style={{ marginLeft: '0.5rem' }}>
                    与已有论文重复
                  </span>
                )}
                {c.warning_message && (
                  <span className="zotero-badge-warning" style={{ marginLeft: '0.5rem' }}>
                    {c.warning_message}
                  </span>
                )}
              </td>
              <td>{c.mapped_authors || '—'}</td>
              <td>{c.mapped_year ?? '—'}</td>
              <td>
                {c.mapped_collections.length > 0
                  ? c.mapped_collections.slice(0, 3).join(', ') +
                    (c.mapped_collections.length > 3 ? ' ...' : '')
                  : '—'}
              </td>
              <td>
                {c.mapped_tags.length > 0
                  ? c.mapped_tags.slice(0, 3).join(', ') +
                    (c.mapped_tags.length > 3 ? ' ...' : '')
                  : '—'}
              </td>
              <td>
                {c.attachment_exists ? (
                  <span className="zotero-badge-attachment">有附件</span>
                ) : (
                  <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.7rem' }}>仅元数据</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
