import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { GeocodeAdministrativeAddressResponse } from '@booking/contracts';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { GeocodeAdministrativeAddressUseCase } from '../../application/use-cases/geocode-administrative-address.use-case';
import {
  GeocodeAdministrativeAddressInputDto,
  GeocodeAdministrativeAddressResponseDto,
} from './dto/administrative-division.dto';

@ApiTags('partner: administrative divisions')
@Controller('partner/administrative-divisions')
export class PartnerAdministrativeDivisionController {
  constructor(private readonly geocodeAddress: GeocodeAdministrativeAddressUseCase) {}

  @RequirePermissions('partner.listings.write')
  @Post('geocode')
  @HttpCode(200)
  @ApiOperation({ summary: 'Find coordinate candidates for a Vietnamese venue address' })
  @ApiOkResponse({ type: GeocodeAdministrativeAddressResponseDto })
  geocode(
    @Body() input: GeocodeAdministrativeAddressInputDto,
  ): Promise<GeocodeAdministrativeAddressResponse> {
    return this.geocodeAddress.execute(input);
  }
}
