import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  legalDocumentTypeSchema,
  type LegalDocumentResponse,
  type LegalDocumentSummary,
  type LegalDocumentType,
  type Locale,
} from '@booking/contracts';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { LegalDocumentNotFound } from '../../domain/errors/legal-errors';
import { GetPublicLegalDocumentUseCase } from '../../application/use-cases/get-public-legal-document.use-case';
import { ListPublicLegalDocumentsUseCase } from '../../application/use-cases/list-public-legal-documents.use-case';
import { LegalDocumentResponseDto, LegalDocumentSummaryDto } from './dto/legal.dto';

/**
 * Storefront legal pages. No tenant context exists here (unauthenticated,
 * cross-tenant), so every route resolves the tenant from the visitor's Host
 * exactly like `PublicTenantController` — see that file for why
 * `x-forwarded-host` is preferred over `host`. Drafts are never reachable
 * here: both use-cases only ever serve a document's `currentVersionId` (or an
 * explicitly superseded but still-published `versionNo`).
 */
@ApiTags('public: legal')
@Controller('public/legal')
export class PublicLegalController {
  constructor(
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly listPublicDocuments: ListPublicLegalDocumentsUseCase,
    private readonly getPublicDocument: GetPublicLegalDocumentUseCase,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Published documents for the host tenant — storefront footer links' })
  @ApiQuery({ name: 'locale', required: false, enum: ['vi', 'en'] })
  @ApiOkResponse({ type: [LegalDocumentSummaryDto] })
  async list(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @Query('locale') locale?: string,
  ): Promise<LegalDocumentSummary[]> {
    const tenant = await this.resolveTenant.execute(this.hostOf(forwardedHost, host));
    return this.listPublicDocuments.execute(tenant.id, this.resolveLocale(locale));
  }

  @Public()
  @Get(':docType')
  @ApiOperation({ summary: 'Current published version of one document, resolved to locale' })
  @ApiQuery({ name: 'locale', required: false, enum: ['vi', 'en'] })
  @ApiOkResponse({ type: LegalDocumentResponseDto })
  async current(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @Param('docType', new ZodValidationPipe(legalDocumentTypeSchema)) docType: LegalDocumentType,
    @Query('locale') locale?: string,
  ): Promise<LegalDocumentResponse> {
    const tenant = await this.resolveTenant.execute(this.hostOf(forwardedHost, host));
    return this.getPublicDocument.execute(tenant.id, docType, this.resolveLocale(locale));
  }

  @Public()
  @Get(':docType/versions/:versionNo')
  @ApiOperation({ summary: 'One specific, superseded but still-published version' })
  @ApiQuery({ name: 'locale', required: false, enum: ['vi', 'en'] })
  @ApiOkResponse({ type: LegalDocumentResponseDto })
  async version(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @Param('docType', new ZodValidationPipe(legalDocumentTypeSchema)) docType: LegalDocumentType,
    @Param('versionNo') versionNoRaw: string,
    @Query('locale') locale?: string,
  ): Promise<LegalDocumentResponse> {
    const tenant = await this.resolveTenant.execute(this.hostOf(forwardedHost, host));
    // `Number('abc')` is NaN and `Number('0')` is 0 — both falsy, which used to
    // fall through to the current-version branch and answer 200 with today's
    // text for a URL that named a specific historical version. 404 is the right
    // outcome, and now it is also the actual one.
    const versionNo = Number(versionNoRaw);
    if (!Number.isInteger(versionNo) || versionNo < 1) throw new LegalDocumentNotFound();
    return this.getPublicDocument.execute(
      tenant.id,
      docType,
      this.resolveLocale(locale),
      versionNo,
    );
  }

  /** Same rule as `PublicTenantController.tenant()` — the visitor's Host, forwarded-first. */
  private hostOf(forwardedHost?: string, host?: string): string {
    const resolved = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolved) throw new MissingTenantHost();
    return resolved;
  }

  /** No `?locale=` means "not specified" — default to the platform's primary locale. */
  private resolveLocale(raw?: string): Locale {
    return raw === 'en' ? 'en' : 'vi';
  }
}
