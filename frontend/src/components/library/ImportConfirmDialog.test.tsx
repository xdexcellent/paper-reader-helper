// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, test, vi } from 'vitest'

import type { Paper } from '../../types'
import { ImportConfirmDialog } from './ImportConfirmDialog'
import type { ImportConfirmPayload } from './libraryTypes'

const existingPapers: Paper[] = [
  {
    id: 1,
    title: 'Known Paper',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'completed',
    local_pdf_path: '/private/known.pdf',
  },
]

type ImportConfirmDialogProps = ComponentProps<typeof ImportConfirmDialog>

function renderDialog(overrides: Partial<ImportConfirmDialogProps> = {}) {
  const onSubmit = vi.fn<(payload: ImportConfirmPayload) => Promise<boolean>>().mockResolvedValue(true)
  const onClose = vi.fn()

  render(
    <ImportConfirmDialog
      existingPapers={existingPapers}
      isSubmitting={false}
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  )

  return { onClose, onSubmit }
}

describe('ImportConfirmDialog', () => {
  test('derives an editable title from the selected PDF file and submits confirmed metadata', async () => {
    const { onSubmit } = renderDialog()
    const file = new File(['%PDF-1.7'], 'paper-quay-sample.pdf', { type: 'application/pdf' })

    fireEvent.change(screen.getByLabelText('PDF 文件'), { target: { files: [file] } })

    expect(screen.getByLabelText('标题')).toHaveValue('paper quay sample')

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '  Confirmed Title  ' } })
    fireEvent.change(screen.getByLabelText('来源'), { target: { value: 'local-library' } })
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        source: 'local-library',
        title: 'Confirmed Title',
        file,
      })
    })
  })

  test('warns about duplicate titles but still allows explicit confirmation', async () => {
    const { onSubmit } = renderDialog()
    const file = new File(['%PDF-1.7'], 'known-paper.pdf', { type: 'application/pdf' })

    fireEvent.change(screen.getByLabelText('PDF 文件'), { target: { files: [file] } })

    expect(screen.getByText('已存在相同标题的论文。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
  })

  test('rejects missing or non-PDF files before submission', async () => {
    const { onSubmit } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请先选择 PDF 文件。')

    const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText('PDF 文件'), { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent('仅支持 PDF 文件。')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('keeps entered metadata when upload fails and closes only through cancel', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    const { onClose } = renderDialog({ onSubmit })
    const file = new File(['%PDF-1.7'], 'failed-upload.pdf', { type: 'application/pdf' })

    fireEvent.change(screen.getByLabelText('PDF 文件'), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Retry Title' } })
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })

    expect(screen.getByLabelText('标题')).toHaveValue('Retry Title')

    fireEvent.click(screen.getByRole('button', { name: '取消导入' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
