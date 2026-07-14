import type { PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Per-route zod validation: `@Body(new ZodValidationPipe(schema))`.
 * Contracts live in @booking/contracts so FE and BE validate with the same schema.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
