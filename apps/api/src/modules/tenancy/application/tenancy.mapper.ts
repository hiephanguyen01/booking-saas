import type {
  DomainResponse,
  PlanResponse,
  PublicTenantResponse,
  SubscriptionResponse,
  TenantResponse,
  Vertical,
} from '@booking/shared';
import type { TenantRecord } from '../domain/ports/tenant-repository.port';
import type { PlanRecord } from '../domain/ports/plan-repository.port';
import type { SubscriptionRecord } from '../domain/ports/subscription-repository.port';
import type { DomainRecord } from '../domain/ports/tenant-domain-repository.port';

export function toTenantResponse(t: TenantRecord): TenantResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    vertical: t.vertical as Vertical,
    defaultTimezone: t.defaultTimezone,
    defaultLocale: t.defaultLocale as 'vi' | 'en',
    createdAt: t.createdAt.toISOString(),
  };
}

export function toPlanResponse(p: PlanRecord): PlanResponse {
  return {
    id: p.id,
    name: p.name,
    priceMonthly: p.priceMonthly.toString(),
    limits: p.limits,
    isActive: p.isActive,
  };
}

export function toSubscriptionResponse(s: SubscriptionRecord): SubscriptionResponse {
  return {
    id: s.id,
    tenantId: s.tenantId,
    planId: s.planId,
    status: s.status,
    startsAt: s.startsAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    note: s.note,
  };
}

export function toPublicTenantResponse(t: TenantRecord, live: boolean): PublicTenantResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    vertical: t.vertical as Vertical,
    defaultLocale: t.defaultLocale as 'vi' | 'en',
    themeConfig: t.themeConfig,
    live,
  };
}

export function toDomainResponse(d: DomainRecord): DomainResponse {
  return {
    id: d.id,
    tenantId: d.tenantId,
    hostname: d.hostname,
    isPrimary: d.isPrimary,
    verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
    ...(d.verificationToken ? { verificationToken: d.verificationToken } : {}),
  };
}
