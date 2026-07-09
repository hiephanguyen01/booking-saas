import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  addDomainInputSchema,
  uuidSchema,
  type AddDomainInput,
  type DomainResponse,
  type DomainVerificationResult,
  type SubscriptionStatusResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from './guards/require-active-subscription.guard';
import { GetTenantUseCase } from '../../application/use-cases/get-tenant.use-case';
import { UpdateTenantUseCase } from '../../application/use-cases/update-tenant.use-case';
import { AddDomainUseCase } from '../../application/use-cases/add-domain.use-case';
import { ListDomainsUseCase } from '../../application/use-cases/list-domains.use-case';
import { VerifyDomainUseCase } from '../../application/use-cases/verify-domain.use-case';
import { GetSubscriptionStatusUseCase } from '../../application/use-cases/get-subscription-status.use-case';
import { toDomainResponse, toSubscriptionStatusResponse } from '../../application/tenancy.mapper';

/** Free-form storefront theme config (§16.1). Stored as `tenants.theme_config`. */
const updateThemeInputSchema = z.object({
  themeConfig: z.record(z.unknown()),
});
type UpdateThemeInput = z.infer<typeof updateThemeInputSchema>;

/** The theme payload the dashboard reads back to hydrate the settings form. */
interface TenantThemeResponse {
  name: string;
  vertical: string;
  defaultLocale: string;
  themeConfig: Record<string, unknown>;
}

/**
 * Tenant self-service settings (Task 1.13): storefront theme (§16.1) and custom
 * domains (§6.1). The tenant only ever acts on its own row — the tenant id comes
 * from the authenticated x-tenant-id scope, never from the request body.
 */
@Controller('tenant')
export class TenantSettingsController {
  constructor(
    private readonly getTenant: GetTenantUseCase,
    private readonly updateTenant: UpdateTenantUseCase,
    private readonly addDomain: AddDomainUseCase,
    private readonly listDomains: ListDomainsUseCase,
    private readonly verifyDomain: VerifyDomainUseCase,
    private readonly getSubscriptionStatus: GetSubscriptionStatusUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  // ── Subscription status ───────────────────────────────────────────────────────

  /**
   * The dashboard reads this to render the read-only / expiry banner (§6.5) and
   * the soft booking-quota nudge. Never blocks anything — purely informational.
   */
  @RequirePermissions('tenant.settings.manage')
  @Get('subscription/status')
  async subscriptionStatus(): Promise<SubscriptionStatusResponse> {
    const view = await this.getSubscriptionStatus.execute(
      this.tenantContext.tenantIdOrThrow(),
      new Date(),
    );
    return toSubscriptionStatusResponse(view);
  }

  // ── Theme ───────────────────────────────────────────────────────────────────

  @RequirePermissions('tenant.theme.manage')
  @Get('theme')
  async theme(): Promise<TenantThemeResponse> {
    const tenant = await this.getTenant.execute(this.tenantContext.tenantIdOrThrow());
    return {
      name: tenant.name,
      vertical: tenant.vertical,
      defaultLocale: tenant.defaultLocale,
      themeConfig: tenant.themeConfig,
    };
  }

  @RequirePermissions('tenant.theme.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch('theme')
  async updateTheme(
    @Body(new ZodValidationPipe(updateThemeInputSchema)) input: UpdateThemeInput,
  ): Promise<TenantThemeResponse> {
    const tenant = await this.updateTenant.execute(this.tenantContext.tenantIdOrThrow(), {
      themeConfig: input.themeConfig,
    });
    return {
      name: tenant.name,
      vertical: tenant.vertical,
      defaultLocale: tenant.defaultLocale,
      themeConfig: tenant.themeConfig,
    };
  }

  // ── Domains ─────────────────────────────────────────────────────────────────

  @RequirePermissions('tenant.settings.manage')
  @Get('domains')
  async domains(): Promise<DomainResponse[]> {
    const domains = await this.listDomains.execute(this.tenantContext.tenantIdOrThrow());
    return domains.map(toDomainResponse);
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('domains')
  async createDomain(
    @Body(new ZodValidationPipe(addDomainInputSchema)) input: AddDomainInput,
  ): Promise<DomainResponse> {
    return toDomainResponse(
      await this.addDomain.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('domains/:id/verify')
  @HttpCode(202)
  async verify(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<DomainVerificationResult> {
    const { status, domain } = await this.verifyDomain.execute(
      this.tenantContext.tenantIdOrThrow(),
      id,
    );
    return { status, domain: toDomainResponse(domain) };
  }
}
