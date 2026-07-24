import * as React from "react"

import {
  MediaViewerCore,
  type MediaViewerBaseProps,
} from "./media-viewer-core"

export interface PackageMediaViewerDialogProps extends MediaViewerBaseProps {
  details: React.ReactNode
}

export function PackageMediaViewerDialog({
  details,
  ...props
}: PackageMediaViewerDialogProps) {
  return <MediaViewerCore {...props} details={details} />
}
