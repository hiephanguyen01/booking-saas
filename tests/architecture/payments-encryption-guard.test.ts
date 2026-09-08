import { describe, expect, it } from 'vitest';
import { readSource, repoPath } from './support/repo';

describe('payments encryption & permission resolution security guards', () => {
  it('enforces PAYMENTS_ENC_KEY production validation in AesGcmCryptoService', () => {
    const cryptoService = readSource(
      repoPath('apps/api/src/modules/payments/infrastructure/aes-gcm-crypto.service.ts'),
    );

    // Must check NODE_ENV === 'production'
    expect(cryptoService).toContain(`process.env.NODE_ENV === 'production'`);
    // Must throw error if missing or using default dev key in production
    expect(cryptoService).toMatch(/throw new Error\([^)]*PAYMENTS_ENC_KEY/);
    // Must cache the key buffer rather than re-hashing on every call
    expect(cryptoService).toContain('this.cachedKey');
  });

  it('ensures PermissionResolverService avoids blocking redis.keys()', () => {
    const resolverService = readSource(
      repoPath(
        'apps/api/src/modules/identity-access/infrastructure/services/permission-resolver.service.ts',
      ),
    );

    // Must not call redis.keys()
    expect(resolverService).not.toMatch(/redis\s*\.\s*keys\s*\(/);
    // Must use index set tracking pattern
    expect(resolverService).toContain('indexKey');
    expect(resolverService).toContain('smembers');
  });

  it('ensures PrismaSessionStore implements Redis L1 cache with invalidation', () => {
    const sessionStore = readSource(
      repoPath(
        'apps/api/src/modules/identity-access/infrastructure/services/prisma-session.store.ts',
      ),
    );

    // Must inject Redis
    expect(sessionStore).toContain('@Inject(REDIS)');
    // Must check Redis cache in findByAccessToken
    expect(sessionStore).toMatch(/redis\s*\.\s*get\s*\(/);
    // Must write to Redis cache
    expect(sessionStore).toMatch(/redis\s*\.\s*set\s*\(/);
    // Must evict from Redis on revocation and rotation
    expect(sessionStore).toMatch(/redis\s*\.\s*del\s*\(/);
  });

  it('ensures PrismaListingRepository caches expensive trust metrics in Redis', () => {
    const listingRepo = readSource(
      repoPath(
        'apps/api/src/modules/listing/infrastructure/repositories/prisma-listing.repository.ts',
      ),
    );

    // Must inject Redis
    expect(listingRepo).toContain('@Inject(REDIS)');
    // Must check Redis cache in findPublicBySlug
    expect(listingRepo).toMatch(/listing-trust:/);
    expect(listingRepo).toMatch(/this\.redis\.get\(/);
    // Must write to Redis with TTL
    expect(listingRepo).toMatch(/this\.redis\.set\(/);
  });

  it('ensures requestId correlation is present in LoggerModule, DomainExceptionFilter, and apiErrorSchema', () => {
    const appModule = readSource(repoPath('apps/api/src/app.module.ts'));
    const exceptionFilter = readSource(
      repoPath('apps/api/src/shared/domain/domain-exception.filter.ts'),
    );
    const commonContracts = readSource(repoPath('packages/contracts/src/contracts/common.ts'));

    // app.module.ts sets genReqId and sets x-request-id response header
    expect(appModule).toContain('genReqId:');
    expect(appModule).toContain("res.setHeader('x-request-id'");

    // domain-exception.filter.ts attaches requestId to error payload
    expect(exceptionFilter).toContain('requestId');
    expect(exceptionFilter).toContain("headers?.['x-request-id']");

    // apiErrorSchema contract defines optional requestId
    expect(commonContracts).toContain('requestId: z.string().optional()');
  });

  it('ensures all payment gateways verify webhook signatures using timingSafeEqual', () => {
    const gateways = ['sepay', 'momo', 'payos', 'zalopay'];
    for (const gw of gateways) {
      const source = readSource(
        repoPath(`apps/api/src/modules/payments/infrastructure/gateways/${gw}-gateway.adapter.ts`),
      );
      expect(source, `${gw} gateway adapter must import and use timingSafeEqual`).toContain(
        'timingSafeEqual',
      );
    }
  });

  it('ensures health readiness probe measures latency and sensitive routes are throttled', () => {
    const healthSource = readSource(repoPath('apps/api/src/shared/health/health.controller.ts'));
    const bookingCtrl = readSource(
      repoPath('apps/api/src/modules/booking/infrastructure/http/public-booking.controller.ts'),
    );

    // Health readiness measures latency
    expect(healthSource).toContain('dbLatencyMs');
    expect(healthSource).toContain('redisLatencyMs');

    // Public booking OTP routes must be rate-limited
    expect(bookingCtrl).toContain('@Throttle(THROTTLE_AUTH_RESEND)');
    expect(bookingCtrl).toContain('@Throttle(THROTTLE_AUTH_ATTEMPT)');
  });
});
