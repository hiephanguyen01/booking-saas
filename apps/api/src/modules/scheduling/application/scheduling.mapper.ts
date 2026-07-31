import type { AvailabilityExceptionResponse, AvailabilityRuleResponse } from '@booking/contracts';
import type { AvailabilityRuleRecord } from '../domain/ports/availability-rule-repository.port';
import type { AvailabilityExceptionRecord } from '../domain/ports/availability-exception-repository.port';

export function toRuleResponse(r: AvailabilityRuleRecord): AvailabilityRuleResponse {
  return { id: r.id, listingId: r.listingId, dayOfWeek: r.dayOfWeek, openTime: r.openTime, closeTime: r.closeTime };
}

export function toExceptionResponse(e: AvailabilityExceptionRecord): AvailabilityExceptionResponse {
  return {
    id: e.id,
    resourceId: e.resourceId,
    date: e.date,
    type: e.type,
    windows: e.windows,
    openTime: e.openTime,
    closeTime: e.closeTime,
    reason: e.reason,
  };
}
