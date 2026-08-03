import type { ChecklistItem, ListingResponse } from '@booking/contracts';

function positiveVnd(value: unknown): boolean {
  if (typeof value === 'bigint') return value > 0n;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function modeConfig(listing: ListingResponse, mode: string): Record<string, unknown> | null {
  const config = listing.modeConfig[mode];
  return config && typeof config === 'object' ? (config as Record<string, unknown>) : null;
}

function modeHasPrice(listing: ListingResponse, mode: string): boolean {
  const config = modeConfig(listing, mode);
  if (!config) return false;
  return positiveVnd(config[mode === 'daily' ? 'basePricePerNight' : 'basePrice']);
}

function modeHasActivePackage(listing: ListingResponse, mode: string): boolean {
  const packages = modeConfig(listing, mode)?.packages;
  return (
    Array.isArray(packages) &&
    packages.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return row.isActive === true && positiveVnd(row.price);
    })
  );
}

/** Mirrors the four checks used by the listing moderation endpoint. */
export function listingSubmissionReadiness(listing: ListingResponse): {
  checklist: ChecklistItem[];
  ready: boolean;
} {
  const hasPricePerMode =
    listing.bookingModes.length > 0 &&
    listing.bookingModes.every((mode) =>
      listing.bookingSelection === 'fixed_packages'
        ? modeHasActivePackage(listing, mode)
        : modeHasPrice(listing, mode),
    );
  const checklist: ChecklistItem[] = [
    { key: 'photos', label: 'Có ít nhất một ảnh', passed: listing.photos.length > 0 },
    {
      key: 'description',
      label: 'Có mô tả đầy đủ',
      passed: Boolean(listing.description?.trim()),
    },
    {
      key: 'price',
      label: 'Mỗi hình thức đặt có giá hoặc gói hợp lệ',
      passed: hasPricePerMode,
    },
    {
      key: 'cancellation',
      label: 'Có chính sách hủy đang áp dụng',
      passed: listing.effectiveCancellationPolicy !== null,
    },
  ];
  return { checklist, ready: checklist.every((item) => item.passed) };
}
