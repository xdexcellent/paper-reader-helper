import { Icon } from '../UiIcon'

type PdfReaderPaneProps = {
  pdfUrl: string | null
  isLoading: boolean
  errorMessage: string
  onRetry: () => Promise<void> | void
}

export function PdfReaderPane({ pdfUrl, isLoading, errorMessage, onRetry }: PdfReaderPaneProps) {
  if (isLoading) {
    return (
      <section className="reader-pdf-pane reader-empty-state" aria-busy="true" aria-label="PDF reader">
        <span className="spinner" />
        <span>Loading PDF...</span>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="reader-pdf-pane reader-empty-state" aria-label="PDF reader">
        <Icon name="warning" />
        <h2>PDF failed to load</h2>
        <p>{errorMessage}</p>
        <button className="btn btn-secondary" onClick={() => void onRetry()} type="button">
          <Icon name="refresh" />
          Retry PDF
        </button>
      </section>
    )
  }

  if (!pdfUrl) {
    return (
      <section className="reader-pdf-pane reader-empty-state" aria-label="PDF reader">
        <Icon name="pdf" />
        <h2>PDF not loaded</h2>
        <button className="btn btn-secondary" onClick={() => void onRetry()} type="button">
          <Icon name="refresh" />
          Load PDF
        </button>
      </section>
    )
  }

  return (
    <section className="reader-pdf-pane" aria-label="PDF reader">
      <iframe className="reader-pdf-iframe" src={pdfUrl} title="PDF preview" />
    </section>
  )
}
