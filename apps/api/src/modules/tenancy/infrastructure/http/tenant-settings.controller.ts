import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  uuidSchema,
  type DomainResponse,
  type DomainVerificationResult,
  type SubscriptionStatusResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from './guards/require-active-subscription.guard';
import { GetTenantUseCase } from '../../application/use-cases/get-tenant.use-case';
import { UpdateTenantUseCase } from '../../application/use-cases/update-tenant.use-case';
import { AddDomainUseCase } from '../../application/use-cases/add-domain.use-case';
import { ListDomainsUseCase } from '../../application/use-cases/list-domains.use-case';
import { VerifyDomainUseCase } from '../../application/use-cases/verify-domain.use-case';
import { DeleteDomainUseCase } from '../../application/use-cases/delete-domain.use-case';
import { GetSubscriptionStatusUseCase } from '../../application/use-cases/get-subscription-status.use-case';
import { toDomainResponse, toSubscriptionStatusResponse } from '../../application/tenancy.mapper';
import {
  AddDomainDto,
  DomainResponseDto,
  DomainVerificationResultDto,
  SubscriptionStatusResponseDto,
  TenantThemeResponseDto,
  UpdateThemeDto,
} from './dto/tenancy.dto';

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
@ApiTags('tenant: settings')
@Controller('tenant')
export class TenantSettingsController {
  constructor(
    private readonly getTenant: GetTenantUseCase,
    private readonly updateTenant: UpdateTenantUseCase,
    private readonly addDomain: AddDomainUseCase,
    private readonly listDomains: ListDomainsUseCase,
    private readonly verifyDomain: VerifyDomainUseCase,
    private readonly deleteDomain: DeleteDomainUseCase,
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
  @ApiOperation({ summary: 'Tenant subscription status + soft booking quota' })
  @ApiOkResponse({ type: SubscriptionStatusResponseDto })
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
  @ApiOperation({ summary: 'Read the storefront theme config' })
  @ApiOkResponse({ type: TenantThemeResponseDto })
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
  @ApiOperation({ summary: 'Update the storefront theme config' })
  @ApiOkResponse({ type: TenantThemeResponseDto })
  async updateTheme(@Body() input: UpdateThemeDto): Promise<TenantThemeResponse> {
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
  @ApiOperation({ summary: "List the tenant's custom domains" })
  @ApiOkResponse({ type: [DomainResponseDto] })
  async domains(): Promise<DomainResponse[]> {
    const domains = await this.listDomains.execute(this.tenantContext.tenantIdOrThrow());
    return domains.map(toDomainResponse);
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('domains')
  @ApiOperation({ summary: 'Add a custom domain to the tenant' })
  @ApiCreatedResponse({ type: DomainResponseDto })
  async createDomain(@Body() input: AddDomainDto): Promise<DomainResponse> {
    return toDomainResponse(
      await this.addDomain.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('domains/:id/verify')
  @HttpCode(202)
  @ApiOperation({ summary: 'Trigger verification of a custom domain' })
  @UuidParam()
  @ApiAcceptedResponse({ type: DomainVerificationResultDto })
  async verify(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<DomainVerificationResult> {
    const { status, domain } = await this.verifyDomain.execute(
      this.tenantContext.tenantIdOrThrow(),
      id,
    );
    return { status, domain: toDomainResponse(domain) };
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete('domains/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a custom domain' })
  @UuidParam()
  @ApiNoContentResponse()
  async removeDomain(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteDomain.execute(this.tenantContext.tenantIdOrThrow(), id);
  }
}
