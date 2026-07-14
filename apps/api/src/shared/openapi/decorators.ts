import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorDto } from './dto';

/**
 * Documents a `Paginated<T>` response: `{ items: T[], page, pageSize, total }`.
 * Mirrors the `Paginated<T>` interface in `@booking/shared`.
 */
export function ApiPaginatedResponse<TModel extends Type<unknown>>(model: TModel) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(model) } },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 0 },
        },
      },
    }),
  );
}

/** Marks a path param as a UUID (format shows in the docs; validation stays on the inline pipe). */
export function UuidParam(name = 'id') {
  return ApiParam({ name, type: 'string', format: 'uuid' });
}

/** Documents the common error responses returned via the `VALIDATION_ERROR`/`AllExceptionsFilter` envelope. */
export function ApiErrorResponses() {
  return applyDecorators(
    ApiResponse({ status: 400, description: 'Validation error', type: ApiErrorDto }),
    ApiResponse({ status: 401, description: 'Not authenticated', type: ApiErrorDto }),
    ApiResponse({ status: 403, description: 'Missing permission', type: ApiErrorDto }),
    ApiResponse({ status: 404, description: 'Not found', type: ApiErrorDto }),
  );
}
