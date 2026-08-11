import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Minus,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@booking/ui/components/ui/dialog"
import { cn } from "@booking/ui/lib/utils"
import { Image } from "@booking/ui/components/media/image"

import { useImageZoom } from "./use-image-zoom"

export interface MediaViewerItem {
  kind: "image" | "video"
  url: string
  alt?: string
  poster?: string
}

export interface MediaViewerLabels {
  close: string
  previous: string
  next: string
  zoomIn: string
  zoomOut: string
  resetZoom: string
  mediaError: string
  video: string
  item: (index: number) => string
  counter: (current: number, total: number) => string
}

export interface MediaViewerBaseProps {
  open: boolean
  items: MediaViewerItem[]
  activeIndex: number
  onOpenChange: (open: boolean) => void
  onActiveIndexChange: (index: number) => void
  labels: MediaViewerLabels
  title: string
  description?: string
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

export type MediaViewerMobileLayout = "inset" | "full-bleed"

interface MediaViewerCoreProps extends MediaViewerBaseProps {
  details?: React.ReactNode
  mobileMediaLayout?: MediaViewerMobileLayout
}

function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-card text-card-foreground shadow-[0_2px_8px_rgba(0,0,0,0.08)] outline-none transition enabled:hover:bg-accent enabled:hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function MediaViewerCore({
  open,
  items,
  activeIndex,
  onOpenChange,
  onActiveIndexChange,
  labels,
  title,
  description,
  returnFocusRef,
  details,
  mobileMediaLayout = "inset",
}: MediaViewerCoreProps) {
  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(items.length - 1, 0))
  const active = items[safeIndex]
  const activeVideoRef = React.useRef<HTMLVideoElement>(null)
  const thumbnailRefs = React.useRef(new Map<number, HTMLButtonElement>())
  const [mediaError, setMediaError] = React.useState(false)
  const zoom = useImageZoom(`${open}:${safeIndex}:${active?.url ?? ""}`)

  const showPrevious = React.useCallback(() => {
    if (safeIndex > 0) onActiveIndexChange(safeIndex - 1)
  }, [onActiveIndexChange, safeIndex])

  const showNext = React.useCallback(() => {
    if (safeIndex < items.length - 1) onActiveIndexChange(safeIndex + 1)
  }, [items.length, onActiveIndexChange, safeIndex])

  React.useEffect(() => {
    setMediaError(false)
    thumbnailRefs.current.get(safeIndex)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    })
  }, [safeIndex, active?.url])

  React.useEffect(() => {
    const video = activeVideoRef.current
    if (!open || active?.kind !== "video" || !video) return

    video.currentTime = 0
    void video.play().catch(() => undefined)
    return () => {
      video.pause()
      video.currentTime = 0
    }
  }, [active?.kind, active?.url, open])

  React.useEffect(() => {
    if (!open && activeVideoRef.current) {
      activeVideoRef.current.pause()
      activeVideoRef.current.currentTime = 0
    }
  }, [open])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLVideoElement) return

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      showPrevious()
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      showNext()
    } else if (active?.kind === "image" && (event.key === "+" || event.key === "=")) {
      event.preventDefault()
      zoom.zoomIn()
    } else if (active?.kind === "image" && event.key === "-") {
      event.preventDefault()
      zoom.zoomOut()
    } else if (active?.kind === "image" && event.key === "0") {
      event.preventDefault()
      zoom.reset()
    }
  }

  function handleCloseAutoFocus(event: Event): void {
    if (!returnFocusRef?.current) return
    event.preventDefault()
    returnFocusRef.current.focus()
  }

  const hasDetails = details !== undefined
  const fullBleedMobile = !hasDetails && mobileMediaLayout === "full-bleed"

  return (
    <Dialog open={open && items.length > 0} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={handleCloseAutoFocus}
        onKeyDown={handleKeyDown}
        className={cn(
          "h-dvh max-h-none w-screen max-w-none translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-none border-0 bg-card p-0 text-card-foreground shadow-2xl sm:h-[min(816px,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)] sm:rounded-lg",
          hasDetails
            ? "sm:w-[min(1232px,calc(100vw-2rem))] sm:max-w-[1232px]"
            : "sm:w-[min(1170px,calc(100vw-2rem))] sm:max-w-[1170px]",
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description ?? title}</DialogDescription>

        <div
          className={cn(
            "size-full min-h-0 overflow-y-auto",
            hasDetails
              ? "flex flex-col lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:grid-rows-1 lg:overflow-hidden"
              : "grid grid-rows-1",
          )}
        >
          <section
            className={cn(
              "flex min-h-0 min-w-0 flex-col gap-3 px-4 pt-14 pb-4 sm:gap-4 sm:px-10 sm:pt-10 sm:pb-10",
              hasDetails
                ? "min-h-fit flex-none lg:min-h-0 lg:flex-auto lg:pr-5"
                : "sm:px-[60px]",
            )}
            aria-label={title}
          >
            <div
              className={cn(
                "grid items-center gap-2 sm:gap-6",
                hasDetails
                  ? "relative h-[min(540px,58vh)] shrink-0 grid-cols-1 lg:h-auto lg:min-h-0 lg:flex-1"
                  : fullBleedMobile
                    ? "relative -mx-4 min-h-0 w-[calc(100%+2rem)] flex-1 grid-cols-1 sm:mx-0 sm:w-auto sm:grid-cols-[40px_minmax(0,1fr)_40px] lg:gap-10"
                    : "min-h-0 flex-1 grid-cols-[40px_minmax(0,1fr)_40px] lg:gap-10",
              )}
            >
              <IconButton
                label={labels.previous}
                onClick={showPrevious}
                disabled={safeIndex === 0}
                className={
                  hasDetails
                    ? "absolute left-3 z-10 bg-foreground/35 text-background backdrop-blur-sm enabled:hover:bg-foreground/55 enabled:hover:text-background"
                    : fullBleedMobile
                      ? "max-sm:absolute max-sm:top-1/2 max-sm:left-3 max-sm:z-10 max-sm:-translate-y-1/2 max-sm:bg-foreground/35 max-sm:text-background max-sm:backdrop-blur-sm max-sm:enabled:hover:bg-foreground/55 max-sm:enabled:hover:text-background"
                      : undefined
                }
              >
                <ChevronLeft className="size-6" aria-hidden="true" />
              </IconButton>

              <div
                ref={zoom.viewportRef}
                className={cn(
                  "relative flex min-h-0 size-full touch-none items-center justify-center overflow-hidden bg-muted/35 select-none",
                  hasDetails
                    ? "h-[min(540px,58vh)] lg:h-full"
                    : "h-[min(540px,62vh)] sm:h-full",
                  zoom.canPan ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
                )}
                onDoubleClick={active?.kind === "image" ? zoom.onDoubleClick : undefined}
                onPointerCancel={active?.kind === "image" ? zoom.onPointerCancel : undefined}
                onPointerDown={active?.kind === "image" ? zoom.onPointerDown : undefined}
                onPointerMove={active?.kind === "image" ? zoom.onPointerMove : undefined}
                onPointerUp={active?.kind === "image" ? zoom.onPointerUp : undefined}
                onWheel={active?.kind === "image" ? zoom.onWheel : undefined}
              >
                {active && !mediaError ? (
                  active.kind === "image" ? (
                    <Image
                      key={active.url}
                      src={active.url}
                      alt={active.alt ?? ""}
                      loading="eager"
                      draggable={false}
                      onError={() => setMediaError(true)}
                      className="max-h-full max-w-full object-contain will-change-transform"
                      style={{
                        transform: `translate3d(${zoom.transform.x}px, ${zoom.transform.y}px, 0) scale(${zoom.transform.scale})`,
                      }}
                    />
                  ) : (
                    <video
                      key={active.url}
                      ref={activeVideoRef}
                      src={active.url}
                      poster={active.poster}
                      controls
                      autoPlay
                      playsInline
                      aria-label={active.alt ?? labels.video}
                      onError={() => setMediaError(true)}
                      className="max-h-full max-w-full bg-black object-contain"
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-3 px-4 text-center text-muted-foreground">
                    <ImageOff className="size-10" aria-hidden="true" />
                    <p className="text-sm">{labels.mediaError}</p>
                  </div>
                )}

                {active?.kind === "image" && !mediaError ? (
                  <div
                    className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-card/95 p-1 shadow-lg backdrop-blur-sm"
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <IconButton
                      label={labels.zoomOut}
                      onClick={zoom.zoomOut}
                      disabled={!zoom.canZoomOut}
                      className="size-9 shadow-none"
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </IconButton>
                    <span className="min-w-12 text-center text-xs font-medium tabular-nums">
                      {Math.round(zoom.transform.scale * 100)}%
                    </span>
                    <IconButton
                      label={labels.zoomIn}
                      onClick={zoom.zoomIn}
                      disabled={!zoom.canZoomIn}
                      className="size-9 shadow-none"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={labels.resetZoom}
                      onClick={zoom.reset}
                      disabled={!zoom.canZoomOut}
                      className="size-9 shadow-none"
                    >
                      <RotateCcw className="size-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                ) : null}
              </div>

              <IconButton
                label={labels.next}
                onClick={showNext}
                disabled={safeIndex >= items.length - 1}
                className={
                  hasDetails
                    ? "absolute right-3 z-10 bg-foreground/35 text-background backdrop-blur-sm enabled:hover:bg-foreground/55 enabled:hover:text-background"
                    : fullBleedMobile
                      ? "max-sm:absolute max-sm:top-1/2 max-sm:right-3 max-sm:z-10 max-sm:-translate-y-1/2 max-sm:bg-foreground/35 max-sm:text-background max-sm:backdrop-blur-sm max-sm:enabled:hover:bg-foreground/55 max-sm:enabled:hover:text-background"
                      : undefined
                }
              >
                <ChevronRight className="size-6" aria-hidden="true" />
              </IconButton>
            </div>

            <p
              className="shrink-0 text-center text-sm font-medium text-muted-foreground sm:text-base"
              aria-live="polite"
            >
              {labels.counter(safeIndex + 1, items.length)}
            </p>

            {items.length > 1 ? (
              <div className="flex h-20 shrink-0 gap-3 overflow-x-auto [scrollbar-width:none] sm:h-35 sm:gap-6 [&::-webkit-scrollbar]:hidden">
                {items.map((item, index) => (
                  <button
                    key={`${item.kind}:${item.url}:${index}`}
                    ref={(node) => {
                      if (node) thumbnailRefs.current.set(index, node)
                      else thumbnailRefs.current.delete(index)
                    }}
                    type="button"
                    onClick={() => onActiveIndexChange(index)}
                    aria-label={labels.item(index + 1)}
                    aria-current={index === safeIndex ? "true" : undefined}
                    className="group relative h-full w-28 shrink-0 overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-48.5"
                  >
                    {item.kind === "image" ? (
                      <Image
                        src={item.url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <>
                        <video
                          src={item.url}
                          poster={item.poster}
                          muted
                          playsInline
                          preload="metadata"
                          className="size-full object-cover"
                        />
                        <span className="absolute inset-0 grid place-items-center bg-scrim-soft text-white">
                          <Play className="size-6 fill-current" aria-hidden="true" />
                        </span>
                      </>
                    )}
                    {index !== safeIndex ? (
                      <span
                        className="absolute inset-0 bg-card/50 transition-colors group-hover:bg-card/25"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {hasDetails ? (
            <aside className="min-h-0 border-t border-border px-5 py-6 lg:overflow-y-auto lg:border-t-0 lg:py-10 lg:pr-10 lg:pl-5">
              {details}
            </aside>
          ) : null}
        </div>

        <DialogClose asChild>
          <IconButton
            label={labels.close}
            className="absolute top-4 right-4 z-20 size-9 bg-muted-foreground text-background shadow-none hover:bg-foreground hover:text-background"
          >
            <X className="size-5" aria-hidden="true" />
          </IconButton>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
