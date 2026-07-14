"use client"

import * as React from "react"
import { ImageIcon, UploadIcon, XIcon } from "lucide-react"

import { cn } from "@booking/ui/lib/utils"
import { Button } from "@booking/ui/components/ui/button"
import { Spinner } from "@booking/ui/components/ui/spinner"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@booking/ui/components/ui/attachment"
import { presignAndPut, type UploadTarget } from "@booking/ui/lib/upload"

/** Raster images the presign endpoint accepts (kept in sync with `@booking/contracts`). */
export const DEFAULT_IMAGE_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const

/** Favicons additionally allow `.ico`. */
export const FAVICON_ACCEPT = [
  "image/png",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/webp",
] as const

const DEFAULT_MAX_SIZE_MB = 5

export interface ImageUploadProps {
  /** Single mode → a URL string; multiple mode → a URL array. */
  value?: string | string[] | null
  onChange: (value: string | string[]) => void
  multiple?: boolean
  target: UploadTarget
  /** Same-origin resource route proxying `POST /uploads/presign`. */
  presignEndpoint?: string
  /** Accepted MIME types (defaults to the image allowlist). */
  accept?: readonly string[]
  maxSizeMb?: number
  /** Cap on total images in multiple mode. */
  maxFiles?: number
  disabled?: boolean
  className?: string
}

interface PendingItem {
  id: string
  name: string
  error?: string
}

/**
 * Controlled image uploader built on the `Attachment` primitive. Uploads each file
 * directly to storage via a presigned URL (see `lib/upload`) and calls `onChange`
 * with the resulting public URL(s) — so a `GenericForm` still submits plain strings
 * as JSON. Validates MIME + size client-side before uploading. Used both by the
 * GenericForm `file` field and directly by hand-rolled forms.
 */
export function ImageUpload({
  value,
  onChange,
  multiple = false,
  target,
  presignEndpoint,
  accept = DEFAULT_IMAGE_ACCEPT,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  maxFiles,
  disabled,
  className,
}: ImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState<PendingItem[]>([])
  const counter = React.useRef(0)

  const urls = React.useMemo(() => normalize(value), [value])
  const atLimit = multiple && maxFiles != null && urls.length >= maxFiles

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return
    const chosen = multiple ? Array.from(files) : Array.from(files).slice(0, 1)
    let current = multiple ? [...urls] : []

    for (const file of chosen) {
      if (multiple && maxFiles != null && current.length >= maxFiles) break
      const id = `u${counter.current++}`
      const error = validate(file, accept, maxSizeMb)
      if (error) {
        setPending((p) => [...p, { id, name: file.name, error }])
        continue
      }
      setPending((p) => [...p, { id, name: file.name }])
      try {
        const { publicUrl } = await presignAndPut(file, { target, presignEndpoint })
        current = multiple ? [...current, publicUrl] : [publicUrl]
        onChange(multiple ? current : (current[0] ?? ""))
        setPending((p) => p.filter((x) => x.id !== id))
      } catch (e) {
        setPending((p) =>
          p.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)),
        )
      }
    }
    if (inputRef.current) inputRef.current.value = ""
  }

  function removeAt(index: number): void {
    const next = urls.filter((_, i) => i !== index)
    onChange(multiple ? next : (next[0] ?? ""))
  }

  const showTrigger = !disabled && !atLimit && (multiple || urls.length === 0)

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(",")}
        multiple={multiple}
        hidden
        disabled={disabled}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="flex flex-wrap gap-3">
        {urls.map((url, i) => (
          <Attachment key={`${url}-${i}`} orientation="vertical" state="done" className="w-28">
            <AttachmentMedia variant="image">
              <img src={url} alt="" />
            </AttachmentMedia>
            <AttachmentActions>
              <AttachmentAction
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Xoá ảnh"
                disabled={disabled}
              >
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}

        {pending.map((item) => (
          <Attachment
            key={item.id}
            orientation="vertical"
            state={item.error ? "error" : "uploading"}
            className="w-28"
          >
            <AttachmentMedia variant="icon">
              {item.error ? <ImageIcon /> : <Spinner data-slot="spinner" />}
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{item.name}</AttachmentTitle>
              {item.error ? <AttachmentDescription>{item.error}</AttachmentDescription> : null}
            </AttachmentContent>
            {item.error ? (
              <AttachmentActions>
                <AttachmentAction
                  type="button"
                  onClick={() => setPending((p) => p.filter((x) => x.id !== item.id))}
                  aria-label="Bỏ qua"
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            ) : null}
          </Attachment>
        ))}

        {showTrigger ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex h-auto min-h-24 w-28 flex-col items-center justify-center gap-1 border-dashed text-muted-foreground"
          >
            <UploadIcon className="size-5" />
            <span className="text-xs">Tải ảnh lên</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function validate(file: File, accept: readonly string[], maxSizeMb: number): string | undefined {
  if (accept.length > 0 && !accept.includes(file.type)) {
    return `Định dạng không hỗ trợ: ${file.type || "không rõ"}`
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `Tệp vượt quá ${maxSizeMb}MB`
  }
  return undefined
}

function normalize(value?: string | string[] | null): string[] {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === "string" && value.length > 0) return [value]
  return []
}
