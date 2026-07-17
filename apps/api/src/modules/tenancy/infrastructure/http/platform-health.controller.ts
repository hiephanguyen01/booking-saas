import type { PlatformHealthResponse } from '@booking/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPlatformHealthResponse } from '../../application/tenancy.mapper';
import { GetPlatformHealthUseCase } from '../../application/use-cases/get-platform-health.use-case';
import { PlatformHealthResponseDto } from './dto/tenancy.dto';

/**
 * Platform-admin health board (Task 1.12). Money crosses the wire as VND đồng
 * digit strings; timestamps as ISO. The response shape is the shared
 * `PlatformHealthResponse` contract — the dashboard imports the same type.
 */
@ApiTags('platform: health')
@Controller('platform/health')
export class PlatformHealthController {
  constructor(private readonly getHealth: GetPlatformHealthUseCase) {}

  @RequirePermissions('platform.tenants.read')
  @Get()
  @ApiOperation({ summary: 'Platform-admin health and KPI board' })
  @ApiOkResponse({ type: PlatformHealthResponseDto })
  async health(): Promise<PlatformHealthResponse> {
    return toPlatformHealthResponse(await this.getHealth.execute());
  }
}
