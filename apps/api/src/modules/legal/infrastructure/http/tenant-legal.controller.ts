import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  legalDocumentTypeSchema,
  type LegalDocumentType,
  type TenantLegalOverview,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { GetTenantLegalUseCase } from '../../application/use-cases/get-tenant-legal.use-case';
import { PublishLegalDocumentUseCase } from '../../application/use-cases/publish-legal-document.use-case';
import { SaveLegalDraftUseCase } from '../../application/use-cases/save-legal-draft.use-case';
import { WithdrawLegalDocumentUseCase } from '../../application/use-cases/withdraw-legal-document.use-case';
import { PublishLegalDocumentDto, SaveLegalDraftDto, TenantLegalOverviewDto } from './dto/legal.dto';

/**
 * Tenant authoring of its four required legal documents (the dashboard's
 * "Pháp lý" tab). Every route needs `tenant.legal.manage` — publishing a
 * binding contract is an owner-level act (Manager is explicitly excluded, see
 * `permission-catalog.ts`). Writes additionally require an active
 * subscription, same as every other tenant-settings mutation.
 */
@ApiTags('tenant: legal')
@Controller('tenant/legal')
export class TenantLegalController {
  constructor(
    private readonly getTenantLegal: GetTenantLegalUseCase,
    private readonly saveDraft: SaveLegalDraftUseCase,
    private readonly publishDocument: PublishLegalDocumentUseCase,
    private readonly withdrawDocument: WithdrawLegalDocumentUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.legal.manage')
  @Get()
  @ApiOperation({ summary: 'All four required documents — draft, published, history' })
  @ApiOkResponse({ type: TenantLegalOverviewDto })
  get(): Promise<TenantLegalOverview> {
    return this.getTenantLegal.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.legal.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Put(':docType/draft')
  @ApiOperation({ summary: 'Create or replace the draft for one document type' })
  async saveDraftRoute(
    @Param('docType', new ZodValidationPipe(legalDocumentTypeSchema)) docType: LegalDocumentType,
    @Body() input: SaveLegalDraftDto,
  ): Promise<void> {
    await this.saveDraft.execute(this.tenantContext.tenantIdOrThrow(), docType, input);
  }

  @RequirePermissions('tenant.legal.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':docType/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish the current draft — cosmetic fix or material change' })
  async publishRoute(
    @Param('docType', new ZodValidationPipe(legalDocumentTypeSchema)) docType: LegalDocumentType,
    @Body() input: PublishLegalDocumentDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.publishDocument.execute(this.tenantContext.tenantIdOrThrow(), docType, input, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.legal.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':docType/publish')
  @HttpCode(204)
  @ApiOperation({ summary: 'Withdraw the published version — storefront stops serving it' })
  @ApiNoContentResponse()
  async withdrawRoute(
    @Param('docType', new ZodValidationPipe(legalDocumentTypeSchema)) docType: LegalDocumentType,
  ): Promise<void> {
    await this.withdrawDocument.execute(this.tenantContext.tenantIdOrThrow(), docType);
  }
}
