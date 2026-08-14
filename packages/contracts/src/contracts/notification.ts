import { z } from 'zod';
import { paginationQuerySchema } from './common';

/** Which bell a row belongs to. Deliberately NOT the email `Audience` type —
 *  a customer has no dashboard, and `admin` is added only when an event
 *  actually addresses the platform console. */
export const notificationAreaSchema = z.enum(['tenant', 'partner', 'affiliate']);
export type NotificationArea = z.infer<typeof notificationAreaSchema>;

/**
 * What a row points at. Stored instead of a URL so a route rename cannot
 * silently 404 every historical notification — the dashboard resolves this to a
 * path through `dashboardPaths` at render time.
 */
export const notificationTargetTypeSchema = z.enum([
  'tenant_partner',
  'tenant_listing_review',
  'tenant_listing_group_review',
  'tenant_disputes',
  'tenant_reviews',
  'tenant_affiliate',
  'partner_booking',
  'partner_listings',
  'partner_revenue',
  'partner_profile',
  'partner_home',
  'affiliate_home',
]);
export type NotificationTargetType = z.infer<typeof notificationTargetTypeSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  area: notificationAreaSchema,
  eventType: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  targetType: notificationTargetTypeSchema,
  targetId: z.string().uuid().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationResponse = z.infer<typeof notificationSchema>;

export const notificationsQuerySchema = paginationQuerySchema.extend({
  area: notificationAreaSchema,
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const unreadCountResponseSchema = z.object({ count: z.number().int().min(0) });
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

export const markAllNotificationsReadInputSchema = z.object({ area: notificationAreaSchema });
export type MarkAllNotificationsReadInput = z.infer<typeof markAllNotificationsReadInputSchema>;
