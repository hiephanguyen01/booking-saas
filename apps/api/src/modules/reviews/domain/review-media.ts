import type { ReviewMediaKind } from '@booking/contracts';

const REVIEW_MEDIA_EXTENSION_KIND: Record<string, ReviewMediaKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  avif: 'image',
  gif: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
};

export function reviewMediaPrefix(tenantId: string, customerId: string, bookingId: string): string {
  return `reviews/${tenantId}/${customerId}/${bookingId}`;
}

export function reviewMediaKindFromKey(key: string): ReviewMediaKind | null {
  const extension = key.split('.').pop()?.toLowerCase();
  return extension ? (REVIEW_MEDIA_EXTENSION_KIND[extension] ?? null) : null;
}

export function isReviewMediaKeyInScope(key: string, prefix: string): boolean {
  return key.startsWith(`${prefix}/`) && !key.includes('..');
}
