import type { PublicPartnerProfileResponse } from '@booking/contracts';
import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { GetPublicPartnerProfileUseCase } from '../../application/use-cases/get-public-partner-profile.use-case';
import { PublicPartnerProfileResponseDto } from './dto/partner.dto';

@ApiTags('public-partners')
@Controller('public/partners')
export class PublicPartnerController {
  constructor(private readonly getProfile: GetPublicPartnerProfileUseCase) {}

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Public provider profile, without contact or payout data' })
  @ApiOkResponse({ type: PublicPartnerProfileResponseDto })
  get(
    @Param('slug') slug: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicPartnerProfileResponse> {
    const resolvedHost = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolvedHost) throw new MissingTenantHost();
    return this.getProfile.execute(resolvedHost, slug);
  }
}
