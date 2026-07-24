import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const contentReportTargetSchema = z.enum(['listing', 'group']);
export type ContentReportTarget = z.infer<typeof contentReportTargetSchema>;

export const contentReportReasonSchema = z.enum([
  'misleading',
  'fraud_or_scam',
  'prohibited_content',
  'contact_or_off_platform',
  'duplicate_or_spam',
  'other',
]);
export type ContentReportReason = z.infer<typeof contentReportReasonSchema>;

export const contentReportStatusSchema = z.enum(['open', 'reviewing', 'resolved', 'dismissed']);
export type ContentReportStatus = z.infer<typeof contentReportStatusSchema>;

export const createContentReportInputSchema = z
  .object({
    target: contentReportTargetSchema,
    targetId: uuidSchema,
    reason: contentReportReasonSchema,
    details: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === 'other' && (!value.details || value.details.length < 20)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['details'],
        message: 'Vui lòng mô tả ít nhất 20 ký tự',
      });
    }
  });
export type CreateContentReportInput = z.infer<typeof createContentReportInputSchema>;

export const updateContentReportInputSchema = z
  .object({
    status: contentReportStatusSchema,
    resolutionNote: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.status === 'resolved' || value.status === 'dismissed') &&
      (!value.resolutionNote || value.resolutionNote.length < 10)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolutionNote'],
        message: 'Ghi chú xử lý cần ít nhất 10 ký tự',
      });
    }
  });
export type UpdateContentReportInput = z.infer<typeof updateContentReportInputSchema>;

export const contentReportResponseSchema = z.object({
  id: uuidSchema,
  target: contentReportTargetSchema,
  /**
   * Deprecated compatibility alias. Older API responses exposed the persistence
   * name beside `target`; keep it explicit until clients complete a removal wave.
   */
  targetType: contentReportTargetSchema,
  targetId: uuidSchema,
  targetTitle: z.string(),
  targetSlug: z.string(),
  partnerId: uuidSchema.nullable(),
  partnerName: z.string(),
  reporterUserId: uuidSchema.nullable(),
  reporterName: z.string(),
  reason: contentReportReasonSchema,
  details: z.string().nullable(),
  status: contentReportStatusSchema,
  handledByUserId: uuidSchema.nullable(),
  resolutionNote: z.string().nullable(),
  handledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContentReportResponse = z.infer<typeof contentReportResponseSchema>;

export const createContentReportResponseSchema = z.object({
  report: contentReportResponseSchema,
  duplicate: z.boolean(),
});
export type CreateContentReportResponse = z.infer<typeof createContentReportResponseSchema>;

export const tenantContentReportsQuerySchema = paginationQuerySchema.extend({
  status: z.union([contentReportStatusSchema, z.literal('all')]).default('all'),
  target: contentReportTargetSchema.optional(),
  q: z.string().trim().max(200).optional(),
});
export type TenantContentReportsQuery = z.infer<typeof tenantContentReportsQuerySchema>;

export const contentReportListResponseSchema = z.object({
  items: z.array(contentReportResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  counts: z.record(z.number().int().nonnegative()),
});
export type ContentReportListResponse = z.infer<typeof contentReportListResponseSchema>;
