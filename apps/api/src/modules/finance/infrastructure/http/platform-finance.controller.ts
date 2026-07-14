import { Controller, Get } from '@nestjs/common';
import type { PlatformFinanceResponse } from '@booking/contracts';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { GetPlatformFinanceUseCase } from '../../application/use-cases/get-platform-finance.use-case';
import { toPlatformFinanceResponse } from '../../application/finance.mapper';

/** Platform-admin finance (§13.3): platform fee collected per tenant (admin pool). */
@Controller('platform/finance')
export class PlatformFinanceController {
  constructor(private readonly platformFinanceUseCase: GetPlatformFinanceUseCase) {}

  @RequirePermissions('platform.finance.read')
  @Get()
  async finance(): Promise<PlatformFinanceResponse> {
    return toPlatformFinanceResponse(await this.platformFinanceUseCase.execute());
  }
}
