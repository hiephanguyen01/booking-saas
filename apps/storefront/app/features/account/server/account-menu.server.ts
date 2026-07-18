import type { Locale } from '@booking/i18n';
import type { AccountMenuSummary } from '../account-menu';
import {
  accountMocksEnabled,
  mockConversations,
  mockReviews,
} from './mock-data.server';

export function getAccountMenuSummary(locale: Locale): AccountMenuSummary | null {
  if (!accountMocksEnabled()) return null;

  try {
    return {
      unreadMessages: mockConversations(locale).reduce(
        (total, conversation) => total + Math.max(0, conversation.unread),
        0,
      ),
      pendingReviews: mockReviews(locale).filter((review) => review.status === 'pending').length,
    };
  } catch {
    return null;
  }
}
