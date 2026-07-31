import { createZodDto } from 'nestjs-zod';
import {
  availabilityExceptionInputSchema,
  availabilityExceptionRangeInputSchema,
  availabilityExceptionResponseSchema,
  availabilityQuerySchema,
  availabilityResponseSchema,
  availabilityRuleResponseSchema,
  calendarRangeQuerySchema,
  setAvailabilityRulesInputSchema,
} from '@booking/contracts';

// Request bodies / queries
export class SetAvailabilityRulesDto extends createZodDto(setAvailabilityRulesInputSchema) {}
export class AvailabilityExceptionDto extends createZodDto(availabilityExceptionInputSchema) {}
export class AvailabilityExceptionRangeDto extends createZodDto(
  availabilityExceptionRangeInputSchema,
) {}
export class AvailabilityQueryDto extends createZodDto(availabilityQuerySchema) {}
export class CalendarRangeQueryDto extends createZodDto(calendarRangeQuerySchema) {}

// Responses
export class AvailabilityRuleResponseDto extends createZodDto(availabilityRuleResponseSchema) {}
export class AvailabilityExceptionResponseDto extends createZodDto(
  availabilityExceptionResponseSchema,
) {}
// A discriminated union can't be a class instance type (TS2509), so this DTO is a
// plain const — still a valid constructor for `@ApiOkResponse({ type })` / Swagger.
// Name it explicitly so the OpenAPI component is `AvailabilityResponseDto` (createZodDto
// otherwise leaves an auto-generated ctor name, which also risks collisions).
export const AvailabilityResponseDto = createZodDto(availabilityResponseSchema);
Object.defineProperty(AvailabilityResponseDto, 'name', { value: 'AvailabilityResponseDto' });
