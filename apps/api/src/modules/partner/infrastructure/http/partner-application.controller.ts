import type {
  PartnerResponse,
  PrivateDocumentUploadResponse,
} from '@booking/contracts';
import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_UPLOAD } from '../../../../shared/http/throttle-limits';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { toPartnerResponse } from '../../application/partner.mapper';
import { ApplyAsPartnerUseCase } from '../../application/use-cases/apply-as-partner.use-case';
import { CreateApplicantDocumentUploadUseCase } from '../../application/use-cases/create-applicant-document-upload.use-case';
import {
  PartnerApplyDto,
  PartnerDocumentUploadDto,
  PartnerResponseDto,
  PrivateDocumentUploadResponseDto,
} from './dto/partner.dto';

/** Partner self-signup (§7.3) — any logged-in user may apply to a tenant. */
@ApiTags('partners')
@Controller('partners')
export class PartnerApplicationController {
  constructor(
    private readonly applyAsPartner: ApplyAsPartnerUseCase,
    private readonly createApplicantDocumentUpload: CreateApplicantDocumentUploadUseCase,
  ) {}

  @AuthenticatedOnly()
  @Throttle(THROTTLE_UPLOAD)
  @Post('application-documents/presign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mint a private partner-application document upload URL' })
  @ApiOkResponse({ type: PrivateDocumentUploadResponseDto })
  async presignApplicationDocument(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: PartnerDocumentUploadDto,
  ): Promise<PrivateDocumentUploadResponse> {
    return this.createApplicantDocumentUpload.execute(principal.userId, input);
  }

  @AuthenticatedOnly()
  @Post('apply')
  @ApiOperation({ summary: 'Apply to become a partner under a tenant' })
  @ApiCreatedResponse({ type: PartnerResponseDto })
  async apply(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: PartnerApplyDto,
    @Ip() ip: string,
  ): Promise<PartnerResponse> {
    return toPartnerResponse(
      await this.applyAsPartner.execute(principal.userId, input, { ip }),
    );
  }
}
