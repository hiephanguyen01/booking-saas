import type {
  DomainResponse,
  PartnerPromotionsToggle,
  PlanResponse,
  PublicTenantResponse,
  SubscriptionHistoryItem,
  SubscriptionResponse,
  SubscriptionStatusResponse,
  TenantDetailResponse,
  TenantResponse,
  TenantThemeResponse,
  Vertical,
} from '@booking/contracts';
import type { TenantRecord } from '../domain/ports/tenant-repository.port';
import type { PlanWithSubscribers } from '../domain/ports/plan-repository.port';
import type {
  SubscriptionHistoryRecord,
  SubscriptionRecord,
} from '../domain/ports/subscription-repository.port';
import type { DomainRecord } from '../domain/ports/tenant-domain-repository.port';
import type { SubscriptionStatusView } from './use-cases/get-subscription-status.use-case';
import type { TenantDetailView } from './use-cases/get-tenant-detail.use-case';

export function toTenantResponse(t: TenantRecord): TenantResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    vertical: t.vertical as Vertical,
    defaultTimezone: t.defaultTimezone,
    defaultLocale: t.defaultLocale as 'vi' | 'en',
    themeConfig: t.themeConfig,
    settings: t.settings,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toTenantDetailResponse(v: TenantDetailView): TenantDetailResponse {
  return {
    ...toTenantResponse(v.tenant),
    subscription: v.subscription
      ? {
          planName: v.subscription.planName,
          status: v.subscription.status,
          expiresAt: v.subscription.expiresAt.toISOString(),
        }
      : null,
    primaryDomain: v.primaryDomain ? toDomainResponse(v.primaryDomain) : null,
    counts: v.counts,
  };
}

/** Derive the partner-promotions flag from the tenant's free-form settings (§12.2). */
export function toPartnerPromotionsToggle(t: TenantRecord): PartnerPromotionsToggle {
  return { partnerPromotionsEnabled: t.settings?.partnerPromotionsEnabled === true };
}

/** The storefront theme payload the dashboard hydrates its settings form from (§16.1). */
export function toTenantThemeResponse(t: TenantRecord): TenantThemeResponse {
  return {
    name: t.name,
    vertical: t.vertical,
    defaultLocale: t.defaultLocale,
    themeConfig: t.themeConfig,
  };
}

export function toPlanResponse({ plan, subscriberCount }: PlanWithSubscribers): PlanResponse {
  return {
    id: plan.id,
    name: plan.name,
    priceMonthly: plan.priceMonthly.toString(),
    limits: plan.limits,
    isActive: plan.isActive,
    subscriberCount,
    // bigint throughout: VND × a subscriber count must never touch a JS float.
    mrr: (BigInt(subscriberCount) * plan.priceMonthly).toString(),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
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

export function toSubscriptionHistoryItem(s: SubscriptionHistoryRecord): SubscriptionHistoryItem {
  return { ...toSubscriptionResponse(s), planName: s.planName };
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

export function toSubscriptionStatusResponse(
  v: SubscriptionStatusView,
): SubscriptionStatusResponse {
  return {
    status: v.status,
    phase: v.evaluation.phase,
    storefrontLive: v.evaluation.storefrontLive,
    // The dashboard is read-only whenever it is not writable (§6.5: expired/cancelled).
    dashboardReadOnly: !v.evaluation.dashboardWritable,
    newBookingsAllowed: v.evaluation.newBookingsAllowed,
    daysUntilExpiry: v.evaluation.daysUntilExpiry,
    expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
    bookingQuota: v.bookingQuota,
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
