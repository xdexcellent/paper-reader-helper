import { Card, CardContent } from '../ui/card'
import { Icon } from '../UiIcon'

/**
 * 扫描前的空状态：告诉用户接下来会发生什么、大致耗时、注意事项。
 */
export function ZoteroEmptyState() {
  return (
    <Card
      className="zotero-empty-state rounded-lg border-dashed border-border/70 bg-card"
      role="note"
      aria-label="Zotero 导入说明"
    >
      <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-500/15 text-blue-600">
          <Icon name="library" className="size-7" />
        </div>
        <h3 className="text-base font-semibold text-foreground">从你的 Zotero 库一键导入</h3>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          填入 <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">zotero.sqlite</code> 的路径，我们会以只读方式扫描你的文献库，
          映射分类/标签，并标记重复论文。扫描过程<strong className="font-semibold text-foreground">不会修改</strong>你原本的 Zotero 数据。
        </p>
        <ul className="mt-1 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <li className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="spark" className="size-3.5 text-blue-600" />
            <span>小型库 &lt; 5 秒 · 大型库 (5000+) 通常 10-30 秒</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="paperclip" className="size-3.5 text-blue-600" />
            <span>自动识别 PDF 附件，无附件条目可选择是否导入元数据</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="check" className="size-3.5 text-blue-600" />
            <span>内置去重：已存在的论文会被标出，避免重复导入</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
