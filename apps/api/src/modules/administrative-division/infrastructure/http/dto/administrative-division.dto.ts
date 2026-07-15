import { createZodDto } from 'nestjs-zod';
import {
  administrativeProvinceSchema,
  administrativeWardSchema,
  listAdministrativeWardsQuerySchema,
} from '@booking/contracts';

export class ListAdministrativeWardsQueryDto extends createZodDto(
  listAdministrativeWardsQuerySchema,
) {}
export class AdministrativeProvinceDto extends createZodDto(administrativeProvinceSchema) {}
export class AdministrativeWardDto extends createZodDto(administrativeWardSchema) {}
