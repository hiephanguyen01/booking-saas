import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain-error';

/**
 * Translates a framework-free {@link DomainError} (thrown by an entity / value
 * object / domain policy) into the app's standard error envelope
 * `{ statusCode, code, message, details? }` — the same shape the zod pipe and the
 * permissions guard already emit. Registered globally via `APP_FILTER` so domain
 * code never has to import Nest just to shape an HTTP response.
 *
 * Only catches `DomainError`; every other exception (NestJS `HttpException`,
 * Prisma errors, etc.) is left to Nest's default handling, unchanged.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(error.httpStatus).json({
      statusCode: error.httpStatus,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
}
