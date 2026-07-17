import type { ModerationActor } from '@booking/contracts';

// Listing-domain display constants shared by the tenant (moderation) and
// partner (workspace) areas.

/** Moderation actor → Vietnamese label ('admin' is the tenant reviewer, §7.3). */
export const MODERATION_ACTOR_LABEL: Record<ModerationActor, string> = {
  partner: 'Đối tác',
  admin: 'Quản trị viên',
};

/**
 * Inventory rental unit → Vietnamese label (capitalized — standalone field
 * values; lowercase inline uses call `.toLowerCase()`).
 */
export const INVENTORY_UNIT_LABEL: Record<'hour' | 'day', string> = { hour: 'Giờ', day: 'Ngày' };
