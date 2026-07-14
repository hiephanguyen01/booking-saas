import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './shared/openapi/swagger';

/** Docs are on outside production, or wherever SWAGGER_ENABLED=true is set. */
function docsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
}

async function bootstrap() {
  // rawBody: true exposes req.rawBody (Buffer) for gateway webhook signature checks (§11.2).
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  // Swagger UI ships inline scripts/styles that helmet's default CSP blocks; relax
  // those directives only while docs are served (never in a locked-down prod).
  app.use(
    helmet(
      docsEnabled()
        ? {
            contentSecurityPolicy: {
              directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                'script-src': ["'self'", "'unsafe-inline'"],
                'style-src': ["'self'", "'unsafe-inline'", 'https:'],
                'img-src': ["'self'", 'data:', 'https:'],
              },
            },
          }
        : undefined,
    ),
  );
  app.use(cookieParser());
  app.enableShutdownHooks();

  if (docsEnabled()) setupSwagger(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
