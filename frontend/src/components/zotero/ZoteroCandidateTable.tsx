import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import type { ZoteroCandidateResponse } from '../../types'

interface Props {
  candidates: ZoteroCandidateResponse[]
  onSelectionChange: (id: number, selected: boolean) => void
}

export function ZoteroCandidateTable({ candidates, onSelectionChange }: Props) {
  if (candidates.length === 0) {
    return (
      <Card className="rounded-lg border-dashed border-border/70 bg-card">
        <CardContent className="flex min-h-[120px] items-center justify-center p-6 text-sm text-muted-foreground">
          暂无导入候选
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="zotero-candidate-table overflow-hidden rounded-lg border-border/70 bg-card shadow-sm">
      <CardHeader className="border-b border-border/70 pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">候选论文列表</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table aria-label="Zotero 导入候选列表">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10" />
              <TableHead>标题</TableHead>
              <TableHead>作者</TableHead>
              <TableHead>年份</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={c.is_selected}
                    onChange={() => onSelectionChange(c.id, !c.is_selected)}
                    aria-label={`${c.is_selected ? '取消选择' : '选择'} ${c.mapped_title}`}
                    className="size-4 cursor-pointer rounded border-border"
                  />
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  <div className="flex flex-col gap-1">
                    <span>{c.mapped_title}</span>
                    <div className="flex flex-wrap gap-1">
                      {c.is_duplicate && (
                        <Badge
                          variant="secondary"
                          className="h-5 rounded-md bg-amber-500/15 px-1.5 text-[0.7rem] font-medium text-amber-700 dark:text-amber-400"
                        >
                          与已有论文重复
                        </Badge>
                      )}
                      {c.warning_message && (
                        <Badge
                          variant="secondary"
                          className="h-5 rounded-md bg-red-500/15 px-1.5 text-[0.7rem] font-medium text-red-600 dark:text-red-400"
                        >
                          {c.warning_message}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.mapped_authors || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{c.mapped_year ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.mapped_collections.length > 0
                    ? c.mapped_collections.slice(0, 3).join(', ') +
                      (c.mapped_collections.length > 3 ? ' ...' : '')
                    : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.mapped_tags.length > 0
                    ? c.mapped_tags.slice(0, 3).join(', ') +
                      (c.mapped_tags.length > 3 ? ' ...' : '')
                    : '—'}
                </TableCell>
                <TableCell>
                  {c.attachment_exists ? (
                    <Badge variant="secondary" className="h-5 rounded-md bg-emerald-500/15 px-1.5 text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-400">
                      有附件
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">仅元数据</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
