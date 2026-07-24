import * as React from "react"

import {
  MediaViewerCore,
  type MediaViewerBaseProps,
  type MediaViewerItem,
  type MediaViewerLabels,
} from "./media-viewer-core"

export type { MediaViewerItem, MediaViewerLabels }

export type MediaViewerDialogProps = MediaViewerBaseProps

export function MediaViewerDialog(props: MediaViewerDialogProps) {
  return <MediaViewerCore {...props} />
}
