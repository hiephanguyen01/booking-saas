import type { MediaViewerLabels } from '@booking/ui/components/media/media-viewer-dialog';
import { useMemo } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';

/**
 * Ten labels from eight translator lookups plus two closures. Memoized on `t`
 * (which `useTranslation` already keeps stable) because several callers sit in a
 * list — the public reviews section renders up to 99 items.
 */
export function useMediaViewerLabels(): MediaViewerLabels {
  const { t } = useTranslation(NsI18n.Common);

  return useMemo(
    () => ({
      close: t('mediaViewer.close'),
      previous: t('mediaViewer.previous'),
      next: t('mediaViewer.next'),
      zoomIn: t('mediaViewer.zoomIn'),
      zoomOut: t('mediaViewer.zoomOut'),
      resetZoom: t('mediaViewer.resetZoom'),
      mediaError: t('mediaViewer.mediaError'),
      video: t('mediaViewer.video'),
      item: (index) => t('mediaViewer.item', { index }),
      counter: (current, total) => t('mediaViewer.counter', { current, total }),
    }),
    [t],
  );
}
