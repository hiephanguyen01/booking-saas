import { Body, Controller, Get, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AcceptanceRecord, PendingAcceptance } from '@booking/contracts';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { ListMyAcceptancesUseCase } from '../../application/use-cases/list-my-acceptances.use-case';
import { ListPendingAcceptancesUseCase } from '../../application/use-cases/list-pending-acceptances.use-case';
import { RecordLegalAcceptanceUseCase } from '../../application/use-cases/record-legal-acceptance.use-case';
import { AcceptanceRecordDto, AcceptLegalDto, PendingAcceptanceDto } from './dto/legal.dto';

/**
 * The signed-in user's own consent state — no RBAC permission, any logged-in
 * user may call it about themselves. Like every other `@AuthenticatedOnly()`
 * controller in this codebase (`customer-favorite`, `customer-finance`,
 * `customer-review`, `customer-content-report`), `PermissionsGuard` short-
 * circuits before it ever seeds `TenantContextService` for these routes (it
 * only does that on the `@RequirePermissions` branch), so there is no tenant
 * in context here either — every route resolves the tenant from the request
 * Host itself, the same way `PublicLegalController` does.
 *
 * `GET /pending` and `POST /accept` are deliberately **not** narrowed to one
 * partner organisation: this is a user-wide self-service surface (there is no
 * verified `x-partner-id` scope on an `@AuthenticatedOnly()` route to narrow
 * to), unlike `RequireCurrentAgreementGuard`, which runs on an already
 * RBAC-checked route and can pass a real `partnerId`.
 */
@ApiTags('me: legal')
@Controller('me/legal')
export class MeLegalController {
  constructor(
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly listPending: ListPendingAcceptancesUseCase,
    private readonly recordAcceptance: RecordLegalAcceptanceUseCase,
    private readonly listMyAcceptances: ListMyAcceptancesUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get('pending')
  @ApiOperation({ summary: 'Documents this user must (re-)accept, across partner + affiliate scope' })
  @ApiOkResponse({ type: [PendingAcceptanceDto] })
  async pending(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PendingAcceptance[]> {
    const tenant = await this.resolveTenant.execute(this.hostOf(forwardedHost, host));
    // The dashboard calls this identically from the partner layout AND the
    // affiliate layout (no scope query param) — customers are never gated, so
    // 'customer' is intentionally excluded from the merge (design §Re-acceptance).
    const [partnerPending, affiliatePending] = await Promise.all([
      this.listPending.execute(tenant.id, principal.userId, 'partner'),
      this.listPending.execute(tenant.id, principal.userId, 'affiliate'),
    ]);
    return [...partnerPending, ...affiliatePending];
  }

  @AuthenticatedOnly()
  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record acceptance of the versions currently on screen' })
  async accept(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: AcceptLegalDto,
    @Ip() ip: string,
  ): Promise<void> {
    const tenant = await this.resolveTenant.execute(this.hostOf(forwardedHost, host));
    // tx: null — this is its own business operation, not nested inside another
    // module's transaction, so RecordLegalAcceptanceUseCase opens its own.
    await this.recordAcceptance.execute(null, {
      tenantId: tenant.id,
      userId: principal.userId,
      partnerId: null,
      acceptedVersionIds: input.versionIds,
      acceptedLocale: input.acceptedLocale,
      ip,
    });
  }

  @AuthenticatedOnly()
  @Get('acceptances')
  @ApiOperation({ summary: "This user's acceptance history, newest first" })
  @ApiOkResponse({ type: [AcceptanceRecordDto] })
  async acceptances(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<AcceptanceRecord[]> {
    const tenant = await this.resolveTenant.execute(this.hostOf(forwardedHost, host));
    return this.listMyAcceptances.execute(tenant.id, principal.userId);
  }

  private hostOf(forwardedHost?: string, host?: string): string {
    const resolved = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolved) throw new MissingTenantHost();
    return resolved;
  }
}
