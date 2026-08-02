import type { ChecklistItem } from '@booking/contracts';

/**
 * Minimum submission checklist a tenant reviewer sees before publishing a post
 * (TONG-QUAN.md §7.3): enough photos, a description, a price for every enabled
 * mode, and a cancellation policy. Pure — the use case gathers the facts.
 */

export const MIN_PHOTOS = 1;

export interface ChecklistFacts {
  photoCount: number;
  hasDescription: boolean;
  /** Every enabled booking mode has a base price configured in mode_config. */
  hasPricePerMode: boolean;
  hasCancellationPolicy: boolean;
}

export function buildReviewChecklist(facts: ChecklistFacts): ChecklistItem[] {
  return [
    {
      key: 'photos',
      label: 'Có ít nhất một ảnh',
      passed: facts.photoCount >= MIN_PHOTOS,
    },
    { key: 'description', label: 'Có mô tả đầy đủ', passed: facts.hasDescription },
    {
      key: 'price',
      label: 'Mỗi hình thức đặt có giá hoặc gói hợp lệ',
      passed: facts.hasPricePerMode,
    },
    {
      key: 'cancellation_policy',
      label: 'Có chính sách hủy đang áp dụng',
      passed: facts.hasCancellationPolicy,
    },
  ];
}

export function checklistPassed(items: ChecklistItem[]): boolean {
  return items.every((i) => i.passed);
}
