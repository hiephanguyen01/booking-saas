import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const reviewRatingSchema = z.coerce.number().int().min(1).max(5);
export type ReviewRating = z.infer<typeof reviewRatingSchema>;

export const reviewMediaKindSchema = z.enum(['image', 'video']);
export type ReviewMediaKind = z.infer<typeof reviewMediaKindSchema>;

export const reviewMediaInputSchema = z.object({
  key: z.string().trim().min(1).max(500),
});
export type ReviewMediaInput = z.infer<typeof reviewMediaInputSchema>;

export const reviewMediaResponseSchema = z.object({
  kind: reviewMediaKindSchema,
  url: z.string().url(),
});
export type ReviewMediaResponse = z.infer<typeof reviewMediaResponseSchema>;

export const reviewImageContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);
export const reviewVideoContentTypeSchema = z.enum([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
export const reviewMediaContentTypeSchema = z.union([
  reviewImageContentTypeSchema,
  reviewVideoContentTypeSchema,
]);
export type ReviewMediaContentType = z.infer<typeof reviewMediaContentTypeSchema>;

export const REVIEW_MEDIA_MAX_FILES = 5;
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const reviewMediaPresignInputSchema = z
  .object({
    bookingId: uuidSchema,
    contentType: reviewMediaContentTypeSchema,
    sizeBytes: z.coerce.number().int().positive(),
  })
  .superRefine((input, context) => {
    const maxBytes = input.contentType.startsWith('image/')
      ? REVIEW_IMAGE_MAX_BYTES
      : REVIEW_VIDEO_MAX_BYTES;
    if (input.sizeBytes > maxBytes) {
      context.addIssue({
        code: 'custom',
        path: ['sizeBytes'],
        message: 'File exceeds the review media size limit',
      });
    }
  });
export type ReviewMediaPresignInput = z.infer<typeof reviewMediaPresignInputSchema>;

export const createReviewInputSchema = z.object({
  bookingId: uuidSchema,
  rating: reviewRatingSchema,
  content: z.string().trim().min(10).max(2000),
  media: z.array(reviewMediaInputSchema).max(REVIEW_MEDIA_MAX_FILES).default([]),
});
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

export const replyReviewInputSchema = z.object({
  content: z.string().trim().min(10).max(2000),
});
export type ReplyReviewInput = z.infer<typeof replyReviewInputSchema>;

export const reviewReplyResponseSchema = z.object({
  id: uuidSchema,
  content: z.string(),
  partnerName: z.string(),
  createdAt: z.string(),
});
export type ReviewReplyResponse = z.infer<typeof reviewReplyResponseSchema>;

export const reviewResponseSchema = z.object({
  id: uuidSchema,
  bookingId: uuidSchema,
  bookingCode: z.string(),
  listingId: uuidSchema,
  listingTitle: z.string(),
  listingSlug: z.string(),
  listingImageUrl: z.string().nullable(),
  groupId: uuidSchema.nullable(),
  groupTitle: z.string().nullable(),
  groupSlug: z.string().nullable(),
  partnerId: uuidSchema,
  partnerName: z.string(),
  customerName: z.string(),
  rating: reviewRatingSchema,
  content: z.string(),
  media: z.array(reviewMediaResponseSchema),
  reply: reviewReplyResponseSchema.nullable(),
  serviceCompletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export const pendingReviewResponseSchema = z.object({
  status: z.literal('pending'),
  bookingId: uuidSchema,
  bookingCode: z.string(),
  listingId: uuidSchema,
  listingTitle: z.string(),
  listingSlug: z.string(),
  listingImageUrl: z.string().nullable(),
  groupTitle: z.string().nullable(),
  partnerName: z.string(),
  serviceCompletedAt: z.string().nullable(),
  bookingStartsAt: z.string().nullable(),
  bookingEndsAt: z.string().nullable(),
  resourceTimezone: z.string(),
});

export const completedReviewResponseSchema = reviewResponseSchema.extend({
  status: z.literal('reviewed'),
  bookingStartsAt: z.string().nullable(),
  bookingEndsAt: z.string().nullable(),
  resourceTimezone: z.string(),
});

export const customerReviewItemSchema = z.discriminatedUnion('status', [
  pendingReviewResponseSchema,
  completedReviewResponseSchema,
]);
export type CustomerReviewItem = z.infer<typeof customerReviewItemSchema>;

export const reviewSummarySchema = z.object({
  ratingAvg: z.number().min(1).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
  unansweredCount: z.number().int().nonnegative(),
  distribution: z.object({
    1: z.number().int().nonnegative(),
    2: z.number().int().nonnegative(),
    3: z.number().int().nonnegative(),
    4: z.number().int().nonnegative(),
    5: z.number().int().nonnegative(),
  }),
});
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

export const reviewListResponseSchema = z.object({
  items: z.array(reviewResponseSchema),
  summary: reviewSummarySchema,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type ReviewListResponse = z.infer<typeof reviewListResponseSchema>;

export const customerReviewListResponseSchema = z.object({
  items: z.array(customerReviewItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type CustomerReviewListResponse = z.infer<typeof customerReviewListResponseSchema>;

export const publicReviewsQuerySchema = paginationQuerySchema.extend({
  target: z.enum(['listing', 'group', 'partner']),
  slug: z.string().trim().min(1).max(200),
  rating: reviewRatingSchema.optional(),
  sort: z.enum(['newest', 'highest', 'lowest']).default('newest'),
});
export type PublicReviewsQuery = z.infer<typeof publicReviewsQuerySchema>;

export const customerReviewsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', 'pending', 'reviewed']).default('all'),
});
export type CustomerReviewsQuery = z.infer<typeof customerReviewsQuerySchema>;

const dashboardReviewFiltersSchema = paginationQuerySchema.extend({
  responseStatus: z.enum(['all', 'pending', 'responded']).default('all'),
  rating: reviewRatingSchema.optional(),
  listingId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().trim().max(200).optional(),
});

export const partnerReviewsQuerySchema = dashboardReviewFiltersSchema;
export type PartnerReviewsQuery = z.infer<typeof partnerReviewsQuerySchema>;

export const tenantReviewsQuerySchema = dashboardReviewFiltersSchema.extend({
  partnerId: uuidSchema.optional(),
});
export type TenantReviewsQuery = z.infer<typeof tenantReviewsQuerySchema>;

export const adminReviewsQuerySchema = dashboardReviewFiltersSchema.extend({
  tenantId: uuidSchema.optional(),
});
export type AdminReviewsQuery = z.infer<typeof adminReviewsQuerySchema>;

export const adminReviewResponseSchema = reviewResponseSchema.extend({
  tenantId: uuidSchema,
  tenantName: z.string(),
});
export type AdminReviewResponse = z.infer<typeof adminReviewResponseSchema>;

export const adminReviewListResponseSchema = reviewListResponseSchema.extend({
  items: z.array(adminReviewResponseSchema),
});
