import { createZodDto } from 'nestjs-zod';
import {
  administrativeProvinceSchema,
  administrativeWardSchema,
  geocodeAdministrativeAddressInputSchema,
  geocodeAdministrativeAddressResponseSchema,
  listAdministrativeWardsQuerySchema,
} from '@booking/contracts';

export class ListAdministrativeWardsQueryDto extends createZodDto(
  listAdministrativeWardsQuerySchema,
) {}
export class AdministrativeProvinceDto extends createZodDto(administrativeProvinceSchema) {}
export class AdministrativeWardDto extends createZodDto(administrativeWardSchema) {}
export class GeocodeAdministrativeAddressInputDto extends createZodDto(
  geocodeAdministrativeAddressInputSchema,
) {}
export class GeocodeAdministrativeAddressResponseDto extends createZodDto(
  geocodeAdministrativeAddressResponseSchema,
) {}
