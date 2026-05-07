import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

import type { PaperDetail } from '../../types'
import { Icon } from '../UiIcon'
import { extractMarkdownHeadings, hasMarkdownContent } from './readerUtils'

type MarkdownReaderPaneProps = {
  paper: PaperDetail | null
  isParsing: boolean
  onParse: () => Promise<void> | void
}

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

function createHeadingComponent(tag: HeadingTag, nextHeadingId: () => string | undefined) {
  const Heading = tag
  return function MarkdownHeading({ children }: { children?: React.ReactNode }) {
    return <Heading id={nextHeadingId()}>{children}</Heading>
  }
}

export function MarkdownReaderPane({ paper, isParsing, onParse }: MarkdownReaderPaneProps) {
  const markdown = paper?.full_markdown ?? ''

  if (!paper || !hasMarkdownContent(markdown)) {
    return (
      <section className="reader-markdown-pane reader-empty-state" aria-label="Markdown reader">
        <Icon name="fileText" />
        <h2>Markdown 尚未生成</h2>
        <p>请先解析此论文以阅读 Markdown 版本。</p>
        {paper && (
          <button className="btn btn-secondary" disabled={isParsing} onClick={() => void onParse()} type="button">
            <Icon name="refresh" />
            {isParsing ? '解析中...' : '解析论文'}
          </button>
        )}
      </section>
    )
  }

  const headings = extractMarkdownHeadings(markdown)
  let headingIndex = 0
  const nextHeadingId = () => headings[headingIndex++]?.id
  const components: Components = {
    h1: createHeadingComponent('h1', nextHeadingId),
    h2: createHeadingComponent('h2', nextHeadingId),
    h3: createHeadingComponent('h3', nextHeadingId),
    h4: createHeadingComponent('h4', nextHeadingId),
    h5: createHeadingComponent('h5', nextHeadingId),
    h6: createHeadingComponent('h6', nextHeadingId),
  }

  return (
    <section className="reader-markdown-pane" aria-label="Markdown reader">
      {headings.length > 0 && (
        <nav className="reader-toc" aria-label="Table of contents">
          {headings.map((heading) => (
            <a
              className={`reader-toc-link level-${heading.level}`}
              href={`#${heading.id}`}
              key={heading.id}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      )}
      <article className="reader-markdown-body">
        <ReactMarkdown
          components={components}
          rehypePlugins={[rehypeKatex]}
          remarkPlugins={[remarkGfm, remarkMath]}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </section>
  )
}
