import { describe, expect, it } from 'vitest';
import { buildReviewChecklist, checklistPassed } from './review-checklist';

describe('review checklist', () => {
  const complete = {
    photoCount: 3,
    hasDescription: true,
    hasPricePerMode: true,
    hasCancellationPolicy: true,
  };

  it('passes when every requirement is met', () => {
    const items = buildReviewChecklist(complete);
    expect(checklistPassed(items)).toBe(true);
    expect(items).toHaveLength(4);
  });

  it('fails the relevant item when a photo/description/price/policy is missing', () => {
    const items = buildReviewChecklist({ ...complete, photoCount: 0, hasCancellationPolicy: false });
    expect(checklistPassed(items)).toBe(false);
    expect(items.find((i) => i.key === 'photos')?.passed).toBe(false);
    expect(items.find((i) => i.key === 'cancellation_policy')?.passed).toBe(false);
    expect(items.find((i) => i.key === 'description')?.passed).toBe(true);
  });
});
