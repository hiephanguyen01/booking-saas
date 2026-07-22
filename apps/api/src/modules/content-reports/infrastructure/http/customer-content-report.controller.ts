import type { CreateContentReportResponse } from '@booking/contracts';
import { Body, Controller, Headers, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { CreateContentReportUseCase } from '../../application/use-cases/create-content-report.use-case';
import { CreateContentReportDto, CreateContentReportResponseDto } from './dto/content-report.dto';

@ApiTags('customer-content-reports')
@Controller('customer/content-reports')
export class CustomerContentReportController {
  constructor(private readonly createReport: CreateContentReportUseCase) {}

  @AuthenticatedOnly()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  @ApiOperation({ summary: 'Report a published listing or listing group to its tenant' })
  @ApiCreatedResponse({ type: CreateContentReportResponseDto })
  create(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: CreateContentReportDto,
  ): Promise<CreateContentReportResponse> {
    return this.createReport.execute(forwardedHost ?? host ?? '', principal.userId, input);
  }
}
