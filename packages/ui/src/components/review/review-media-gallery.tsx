import * as React from "react"
import { Play } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@booking/ui/components/ui/dialog"
import { cn } from "@booking/ui/lib/utils"

export interface ReviewMediaGalleryItem {
  kind: "image" | "video"
  url: string
}

export function ReviewMediaGallery({
  items,
  className,
  viewLabel,
  viewerTitle,
}: {
  items: ReviewMediaGalleryItem[]
  className?: string
  viewLabel: string
  viewerTitle: string
}) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)
  const active = activeIndex === null ? null : items[activeIndex]

  if (items.length === 0) return null

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {items.map((item, index) => (
          <button
            key={`${item.url}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            aria-label={`${viewLabel} ${index + 1}`}
            className="group relative size-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {item.kind === "image" ? (
              <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <>
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                  <Play className="size-6 fill-current" aria-hidden="true" />
                </span>
              </>
            )}
          </button>
        ))}
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveIndex(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] gap-3 overflow-hidden p-4 sm:max-w-4xl">
          <DialogHeader className="pr-10">
            <DialogTitle>{viewerTitle}</DialogTitle>
            <DialogDescription className="sr-only">{viewLabel}</DialogDescription>
          </DialogHeader>
          {active?.kind === "image" ? (
            <img
              src={active.url}
              alt=""
              className="max-h-[calc(100vh-8rem)] w-full rounded-md object-contain"
            />
          ) : active ? (
            <video
              key={active.url}
              src={active.url}
              controls
              autoPlay
              playsInline
              className="max-h-[calc(100vh-8rem)] w-full rounded-md bg-black object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
