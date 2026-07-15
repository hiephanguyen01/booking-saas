import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ListProvincesUseCase } from '../../application/use-cases/list-provinces.use-case';
import { ListWardsUseCase } from '../../application/use-cases/list-wards.use-case';
import {
  AdministrativeProvinceDto,
  AdministrativeWardDto,
  ListAdministrativeWardsQueryDto,
} from './dto/administrative-division.dto';

@ApiTags('public: administrative divisions')
@Controller('public/administrative-divisions')
export class PublicAdministrativeDivisionController {
  constructor(
    private readonly listProvinces: ListProvincesUseCase,
    private readonly listWards: ListWardsUseCase,
  ) {}

  @Public()
  @Get('provinces')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'List the current Vietnamese provinces and municipalities' })
  @ApiOkResponse({ type: [AdministrativeProvinceDto] })
  provinces(): Promise<AdministrativeProvince[]> {
    return this.listProvinces.execute();
  }

  @Public()
  @Get('wards')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'List wards, communes and special zones in one province' })
  @ApiQuery({ type: ListAdministrativeWardsQueryDto })
  @ApiOkResponse({ type: [AdministrativeWardDto] })
  wards(@Query() query: ListAdministrativeWardsQueryDto): Promise<AdministrativeWard[]> {
    return this.listWards.execute(query.provinceCode);
  }
}
