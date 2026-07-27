import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { ACCESS_COOKIE } from '../../modules/identity-access/infrastructure/http/cookies';

/**
 * Mounts the OpenAPI document at `/docs` (UI) and `/docs-json` (raw JSON).
 *
 * Schemas are generated from the same `@booking/contracts` zod contracts used for
 * validation: request/response bodies are `createZodDto(...)` classes, and
 * `cleanupOpenApiDoc` post-processes the zod-derived parts of the document. This
 * keeps the docs in lock-step with the types the API actually validates/returns.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('BookingOS API')
    .setDescription('Booking SaaS + marketplace API. Schemas are generated from the shared zod contracts.')
    .setVersion('0.0.1')
    // Two ways to authenticate: the session cookie (browser BFF) or a bearer access token.
    .addCookieAuth(ACCESS_COOKIE, { type: 'apiKey', in: 'cookie', name: ACCESS_COOKIE })
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true },
  });
}
