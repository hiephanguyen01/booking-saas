import * as React from "react"
import { Play } from "lucide-react"

import {
  MediaViewerDialog,
  type MediaViewerLabels,
} from "@booking/ui/components/media/media-viewer-dialog"
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
  viewerLabels,
}: {
  items: ReviewMediaGalleryItem[]
  className?: string
  viewLabel: string
  viewerTitle: string
  viewerLabels: MediaViewerLabels
}) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)

  if (items.length === 0) return null

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {items.map((item, index) => (
          <button
            key={`${item.url}-${index}`}
            type="button"
            onClick={(event) => {
              triggerRef.current = event.currentTarget
              setActiveIndex(index)
            }}
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

      <MediaViewerDialog
        open={activeIndex !== null}
        items={items}
        activeIndex={activeIndex ?? 0}
        onOpenChange={(open) => {
          if (!open) setActiveIndex(null)
        }}
        onActiveIndexChange={setActiveIndex}
        labels={viewerLabels}
        title={viewerTitle}
        description={viewLabel}
        returnFocusRef={triggerRef}
      />
    </>
  )
}
