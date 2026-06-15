import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PaperThumbnail } from './PaperThumbnail'

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
              <PaperThumbnail
                variant={variant}
                paperId={paperId}
                thumbnailUrl={thumbnailUrl}
                title={title}
                abstractText={abstractText}
                className="h-[260px] w-[200px]"
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
