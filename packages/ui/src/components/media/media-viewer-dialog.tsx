import * as React from "react"

import {
  MediaViewerCore,
  type MediaViewerBaseProps,
  type MediaViewerItem,
  type MediaViewerLabels,
  type MediaViewerMobileLayout,
} from "./media-viewer-core"

export type { MediaViewerItem, MediaViewerLabels, MediaViewerMobileLayout }

export interface MediaViewerDialogProps extends MediaViewerBaseProps {
  mobileMediaLayout?: MediaViewerMobileLayout
}

export function MediaViewerDialog(props: MediaViewerDialogProps) {
  return <MediaViewerCore {...props} />
}
