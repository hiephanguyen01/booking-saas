import { BadRequestException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import type { ZodError } from 'zod';

/**
 * Global pipe that validates any parameter typed with a `createZodDto(...)` class
 * (body/query) against its zod schema, and passes every other parameter through
 * untouched (scalar `@Param`s keep their inline `ZodValidationPipe`, `@Req`/`@Res`
 * are ignored). It throws the same `VALIDATION_ERROR` envelope as the per-route
 * `ZodValidationPipe`, so error responses are unchanged. Registered via `APP_PIPE`.
 */
export const ZodDtoValidationPipe = createZodValidationPipe({
  createValidationException: (error) =>
    new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request payload',
      details: (error as ZodError).flatten(),
    }),
});
