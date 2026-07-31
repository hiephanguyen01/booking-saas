import { createZodDto } from 'nestjs-zod';
import {
  acceptLegalInputSchema,
  acceptanceRecordSchema,
  legalDocumentResponseSchema,
  legalDocumentSummarySchema,
  pendingAcceptanceSchema,
  publishLegalDocumentInputSchema,
  saveLegalDraftInputSchema,
  tenantLegalOverviewSchema,
} from '@booking/contracts';

// ── Request bodies ──────────────────────────────────────────────────────────
export class SaveLegalDraftDto extends createZodDto(saveLegalDraftInputSchema) {}
export class PublishLegalDocumentDto extends createZodDto(publishLegalDocumentInputSchema) {}
export class AcceptLegalDto extends createZodDto(acceptLegalInputSchema) {}

// ── Responses ────────────────────────────────────────────────────────────────
export class TenantLegalOverviewDto extends createZodDto(tenantLegalOverviewSchema) {}
export class LegalDocumentResponseDto extends createZodDto(legalDocumentResponseSchema) {}
export class LegalDocumentSummaryDto extends createZodDto(legalDocumentSummarySchema) {}
export class PendingAcceptanceDto extends createZodDto(pendingAcceptanceSchema) {}
export class AcceptanceRecordDto extends createZodDto(acceptanceRecordSchema) {}
