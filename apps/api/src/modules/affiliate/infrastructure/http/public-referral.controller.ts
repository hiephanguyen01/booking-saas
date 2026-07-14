import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { TrackReferralResponse } from '@booking/contracts';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { TrackReferralUseCase } from '../../application/use-cases/track-referral.use-case';
import { TrackReferralDto, TrackReferralResponseDto } from './dto/affiliate.dto';

/** Storefront referral click tracking (§15.1). Tenant resolved from Host (BFF). */
@ApiTags('public-referrals')
@Controller('public/referrals')
export class PublicReferralController {
  constructor(private readonly trackReferral: TrackReferralUseCase) {}

  @Public()
  @Post('track')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a referral click and validate the code' })
  @ApiOkResponse({ type: TrackReferralResponseDto })
  async track(@Body() input: TrackReferralDto, @Req() req: Request): Promise<TrackReferralResponse> {
    return this.trackReferral.execute(hostOf(req), input, {
      ip: clientIp(req),
      userAgent: headerOf(req, 'user-agent'),
    });
  }
}

function hostOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.headers.host;
  if (!raw) throw new BadRequestException({ statusCode: 400, code: 'MISSING_HOST', message: 'Host header is required' });
  return raw;
}

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || undefined;
}

function headerOf(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) || undefined;
}
