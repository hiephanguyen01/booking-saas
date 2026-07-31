import { Body, Controller, Get, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AcceptanceRecord, PendingAcceptance } from '@booking/contracts';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { ListMyAcceptancesUseCase } from '../../application/use-cases/list-my-acceptances.use-case';
import { ListPendingAcceptancesUseCase } from '../../application/use-cases/list-pending-acceptances.use-case';
import { RecordLegalAcceptanceUseCase } from '../../application/use-cases/record-legal-acceptance.use-case';
import {
  ResolveLegalCallerScopeUseCase,
  type LegalCallerScopeInput,
} from '../../application/use-cases/resolve-legal-caller-scope.use-case';
import { AcceptanceRecordDto, AcceptLegalDto, PendingAcceptanceDto } from './dto/legal.dto';

/**
 * The signed-in user's own consent state — no RBAC permission, any logged-in
 * user may call it about themselves. Like every other `@AuthenticatedOnly()`
 * controller in this codebase (`customer-favorite`, `customer-finance`,
 * `customer-review`, `customer-content-report`), `PermissionsGuard` short-
 * circuits before it ever seeds `TenantContextService` for these routes.
 *
 * Which tenant (and which re-acceptance gate) a call belongs to is therefore
 * resolved by `ResolveLegalCallerScopeUseCase` from the scope headers the
 * dashboard sends, falling back to the request Host for storefront callers —
 * see that use-case for why Host alone could never work here. Everything below
 * is narrowed to the caller's own `userId`; no route reads another person's
 * consent.
 */
@ApiTags('me: legal')
@Controller('me/legal')
export class MeLegalController {
  constructor(
    private readonly resolveScope: ResolveLegalCallerScopeUseCase,
    private readonly listPending: ListPendingAcceptancesUseCase,
    private readonly recordAcceptance: RecordLegalAcceptanceUseCase,
    private readonly listMyAcceptances: ListMyAcceptancesUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get('pending')
  @ApiOperation({ summary: "Documents this user must (re-)accept in the scope they are acting in" })
  @ApiOkResponse({ type: [PendingAcceptanceDto] })
  async pending(
    @Headers() headers: Record<string, string | undefined>,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PendingAcceptance[]> {
    const scope = await this.resolveScope.execute(this.scopeInput(headers, principal));
    // Only the gates the caller provably stands in: a partner is asked for
    // partner_terms, an affiliate for affiliate_terms, and neither is dragged
    // through the other's document. Merging both unconditionally forced every
    // partner to "accept" the CTV terms whenever those were republished.
    const results = await Promise.all(
      scope.scopes.map((s) =>
        this.listPending.execute(
          scope.tenantId,
          principal.userId,
          s,
          s === 'partner' ? scope.partnerId : null,
        ),
      ),
    );
    return results.flat();
  }

  @AuthenticatedOnly()
  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record acceptance of the versions currently on screen' })
  async accept(
    @Headers() headers: Record<string, string | undefined>,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: AcceptLegalDto,
    @Ip() ip: string,
  ): Promise<void> {
    const scope = await this.resolveScope.execute(this.scopeInput(headers, principal));
    // tx: null — this is its own business operation, not nested inside another
    // module's transaction, so RecordLegalAcceptanceUseCase opens its own.
    // `partnerId` is the verified partner scope, so the row lands under the same
    // key `RequireCurrentAgreementGuard` reads it back with; writing NULL here
    // left every partner permanently blocked on their own signature.
    await this.recordAcceptance.execute(null, {
      tenantId: scope.tenantId,
      userId: principal.userId,
      partnerId: scope.partnerId,
      acceptedVersionIds: input.versionIds,
      requestedLocale: input.acceptedLocale,
      ip,
    });
  }

  @AuthenticatedOnly()
  @Get('acceptances')
  @ApiOperation({ summary: "This user's acceptance history, newest first" })
  @ApiOkResponse({ type: [AcceptanceRecordDto] })
  async acceptances(
    @Headers() headers: Record<string, string | undefined>,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<AcceptanceRecord[]> {
    const scope = await this.resolveScope.execute(this.scopeInput(headers, principal));
    return this.listMyAcceptances.execute(scope.tenantId, principal.userId);
  }

  private scopeInput(
    headers: Record<string, string | undefined>,
    principal: SessionPrincipal,
  ): LegalCallerScopeInput {
    return {
      userId: principal.userId,
      tenantIdHeader: headers['x-tenant-id'],
      partnerIdHeader: headers['x-partner-id'],
      affiliateTenantHeader: headers['x-affiliate-tenant'],
      forwardedHost: headers['x-forwarded-host'],
      host: headers.host,
    };
  }
}
