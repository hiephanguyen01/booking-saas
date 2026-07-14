import type { PlatformFinanceResponse } from '@booking/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPlatformFinanceResponse } from '../../application/finance.mapper';
import { GetPlatformFinanceUseCase } from '../../application/use-cases/get-platform-finance.use-case';
import { PlatformFinanceResponseDto } from './dto/finance.dto';

/** Platform-admin finance (§13.3): platform fee collected per tenant (admin pool). */
@ApiTags('platform-finance')
@Controller('platform/finance')
export class PlatformFinanceController {
  constructor(private readonly platformFinanceUseCase: GetPlatformFinanceUseCase) {}

  @RequirePermissions('platform.finance.read')
  @Get()
  @ApiOperation({ summary: 'Platform fee collected per tenant' })
  @ApiOkResponse({ type: PlatformFinanceResponseDto })
  async finance(): Promise<PlatformFinanceResponse> {
    return toPlatformFinanceResponse(await this.platformFinanceUseCase.execute());
  }
}
