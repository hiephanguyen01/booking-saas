/**
 * Current commission-schedule version recorded in agreement_acceptances when a
 * tenant approves a partner (§7.2). Bump when the schedule changes; a tenant
 * may then require partners to re-accept.
 *
 * Partner-terms acceptance no longer happens here — it is recorded at
 * application time from the document version the applicant actually saw (see
 * `legal`'s `RecordLegalAcceptanceUseCase`, called from `ApplyAsPartnerUseCase`).
 */
export const CURRENT_COMMISSION_SCHEDULE_VERSION = '2026-01';
