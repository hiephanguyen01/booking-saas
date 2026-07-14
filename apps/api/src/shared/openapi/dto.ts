import { createZodDto } from 'nestjs-zod';
import { apiErrorSchema } from '@booking/contracts';

/** The standard error envelope (`AllExceptionsFilter` output) for documenting non-2xx responses. */
export class ApiErrorDto extends createZodDto(apiErrorSchema) {}
