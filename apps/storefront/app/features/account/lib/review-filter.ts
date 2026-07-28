import { z } from 'zod';

export const accountReviewFilterSchema = z.enum(['all', 'pending', 'reviewed']).catch('all');

export type AccountReviewFilter = z.infer<typeof accountReviewFilterSchema>;

export function parseAccountReviewFilter(value: string | null | undefined): AccountReviewFilter {
  return accountReviewFilterSchema.parse(value ?? 'all');
}
