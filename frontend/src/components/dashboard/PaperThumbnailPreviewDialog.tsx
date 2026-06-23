import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PaperThumbnail } from './PaperThumbnail'
import { FileText } from 'lucide-react'

type PaperThumbnailPreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  variant: number
  paperId?: number | string
  thumbnailUrl?: string
  abstractText?: string
}

function isDisplayableImageUrl(url?: string): url is string {
  if (!url) return false
  return !url.startsWith('blob:') && !/\.pdf(?:$|[?#])/i.test(url) && !/\/pdf(?:$|[?#])/i.test(url)
}

function compactText(text?: string): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

export function PaperThumbnailPreviewDialog({
  open,
  onOpenChange,
  title,
  variant,
  paperId,
  thumbnailUrl,
  abstractText,
}: PaperThumbnailPreviewDialogProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const imageUrl = isDisplayableImageUrl(thumbnailUrl) && thumbnailUrl !== failedImageUrl ? thumbnailUrl : ''

  useEffect(() => {
    if (open) setFailedImageUrl(null)
  }, [open, thumbnailUrl])

  const previewTitle = compactText(title) || 'Untitled paper'
  const previewAbstract = compactText(abstractText) || '摘要预览暂不可用。可在论文详情页查看完整内容。'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[640px] !rounded-2xl !bg-white !p-0 !text-[#0F172A] !ring-[#E2E8F0]"
        style={{ background: '#FFFFFF', color: '#0F172A' }}
      >
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="line-clamp-2 !text-[15px] !font-semibold !leading-6 !text-[#0F172A]">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">论文代表图预览</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4">
          <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`代表图预览：${title}`}
                className="max-h-[58vh] w-full object-contain"
                onError={() => setFailedImageUrl(imageUrl)}
              />
            ) : (
              <div className="flex w-full max-w-[480px] flex-col gap-3 p-6">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#64748B]">
                  <FileText size={14} />
                  <span>该论文暂无代表图，以下为文本预览</span>
                </div>
                <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-[15px] font-bold leading-6 text-[#0F172A]">{previewTitle}</h3>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    <span>Abstract</span>
                    <span className="h-px flex-1 bg-[#E2E8F0]" />
                  </div>
                  <p className="text-[13px] leading-5 text-[#475569]">{previewAbstract}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
