import { Icon } from '../UiIcon'

/**
 * 扫描前的空状态：告诉用户接下来会发生什么、大致耗时、注意事项。
 */
export function ZoteroEmptyState() {
  return (
    <div className="zotero-empty-state" role="note" aria-label="Zotero 导入说明">
      <div className="zotero-empty-icon" aria-hidden="true">
        <Icon name="library" />
      </div>
      <h2 className="zotero-empty-title">从你的 Zotero 库一键导入</h2>
      <p className="zotero-empty-desc">
        填入 <code>zotero.sqlite</code> 的路径，我们会以只读方式扫描你的文献库，
        映射分类/标签，并标记重复论文。扫描过程<strong>不会修改</strong>你原本的 Zotero 数据。
      </p>
      <ul className="zotero-empty-highlights">
        <li>
          <Icon name="spark" />
          <span>小型库 &lt; 5 秒 · 大型库 (5000+) 通常 10-30 秒</span>
        </li>
        <li>
          <Icon name="paperclip" />
          <span>自动识别 PDF 附件，无附件条目可选择是否导入元数据</span>
        </li>
        <li>
          <Icon name="check" />
          <span>内置去重：已存在的论文会被标出，避免重复导入</span>
        </li>
      </ul>
    </div>
  )
}
