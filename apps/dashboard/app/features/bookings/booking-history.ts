import type { BookingStatusHistoryResponse } from '@booking/contracts';
import { bookingStatusMeta } from '~/components/status-badge';
import type { TimelineEntry } from '~/components/timeline';

/**
 * Map a booking's status-history rows (§8.2) into `Timeline` entries. Shared by
 * the tenant + partner detail loaders so both render the same audit trail: each
 * transition is labelled by the status it moved *to*, with its actor + reason.
 * The backend returns rows oldest-first, which the timeline reads top → bottom.
 */
export function toTimelineEntries(history: BookingStatusHistoryResponse[]): TimelineEntry[] {
  return history.map((row) => ({
    label: bookingStatusMeta(row.toStatus).label,
    at: row.createdAt,
    actor: row.actorName,
    reason: row.reason,
  }));
}
