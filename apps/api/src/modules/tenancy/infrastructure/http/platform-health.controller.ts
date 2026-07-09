import { Controller, Get } from '@nestjs/common';
import type { PlatformHealthResponse } from '@booking/shared';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import {
  GetPlatformHealthUseCase,
  type PlatformHealth,
} from '../../application/use-cases/get-platform-health.use-case';

/**
 * Platform-admin health board (Task 1.12). Money crosses the wire as VND đồng
 * digit strings; timestamps as ISO. The response shape is the shared
 * `PlatformHealthResponse` contract — the dashboard imports the same type.
 */
@Controller('platform/health')
export class PlatformHealthController {
  constructor(private readonly getHealth: GetPlatformHealthUseCase) {}

  @RequirePermissions('platform.tenants.read')
  @Get()
  async health(): Promise<PlatformHealthResponse> {
    return toResponse(await this.getHealth.execute());
  }
}

function toResponse(h: PlatformHealth): PlatformHealthResponse {
  return {
    kpis: {
      tenantCount: h.kpis.tenantCount,
      activeTenantCount: h.kpis.activeTenantCount,
      gmvAllTime: h.kpis.gmvAllTime.toString(),
      gmv30d: h.kpis.gmv30d.toString(),
      publishedListings: h.kpis.publishedListings,
      bookings30d: h.kpis.bookings30d,
      webhookFailures: h.kpis.webhookFailures,
      overduePayouts: h.kpis.overduePayouts,
    },
    gmvTrend: h.gmvTrend.map((p) => ({ date: p.date, gmv: p.gmv.toString() })),
    tenants: h.tenants.map((t) => ({
      tenantId: t.tenantId,
      name: t.name,
      slug: t.slug,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      gmv: t.gmv.toString(),
      gmv30d: t.gmv30d.toString(),
      bookings30d: t.bookings30d,
      firstBookingHours: t.firstBookingHours,
      publishedListings: t.publishedListings,
      webhookFailures: t.webhookFailures,
      overduePayouts: t.overduePayouts,
      subscription: t.subscription
        ? {
            status: t.subscription.status,
            expiresAt: t.subscription.expiresAt.toISOString(),
            planName: t.subscription.planName,
          }
        : null,
    })),
    expiring: h.expiring.map((e) => ({
      tenantId: e.tenantId,
      tenantName: e.tenantName,
      planName: e.planName,
      status: e.status,
      expiresAt: e.expiresAt.toISOString(),
      daysLeft: e.daysLeft,
    })),
  };
}
