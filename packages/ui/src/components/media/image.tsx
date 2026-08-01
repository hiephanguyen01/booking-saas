import * as React from 'react';

export interface ImageProps extends React.ComponentPropsWithoutRef<'img'> {
  /** Load immediately and give the image high network priority (hero/LCP images only). */
  priority?: boolean;
}

/**
 * Application-wide image boundary.
 *
 * Content images are lazy-loaded and decoded asynchronously by default. Keep all
 * image delivery policy here so future CDN transforms, srcsets, placeholders or
 * telemetry can be introduced without changing every call site.
 */
export const Image = React.forwardRef<HTMLImageElement, ImageProps>(function Image(
  { priority = false, loading, decoding = 'async', fetchPriority, ...props },
  ref,
) {
  return (
    <img
      ref={ref}
      loading={priority ? 'eager' : (loading ?? 'lazy')}
      decoding={decoding}
      fetchPriority={priority ? 'high' : fetchPriority}
      {...props}
    />
  );
});
