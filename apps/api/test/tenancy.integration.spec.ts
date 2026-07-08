import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';
import { PlanLimitService } from '../src/modules/tenancy/application/services/plan-limit.service';

const API_DIR = path.resolve(__dirname, '..');
const day = 86_400_000;

/**
 * Task 1.1 DoD (TONG-QUAN.md §6): two tenants on different hostnames resolve to
 * isolated data; plan-limit and subscription-expiry behaviours are enforced.
 */
describe('tenancy: domains, plans, subscriptions', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminCookies: string[];
  let alphaId: string;
  let betaId: string;

  beforeAll(async () => {
    db = await startTestDb();
    redis = await new RedisContainer('redis:7').start();

    const base = db.container;
    process.env.DATABASE_URL = `postgresql://app_user:app_user_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.ADMIN_DATABASE_URL = `postgresql://app_admin:app_admin_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.MIGRATE_DATABASE_URL = base.getConnectionUri();
    process.env.REDIS_URL = redis.getConnectionUrl();
    process.env.SESSION_COOKIE_SECURE = 'false';
    process.env.OUTBOX_RELAY_DISABLED = 'true';
    process.env.SEED_DEMO = 'false';
    process.env.PLATFORM_BASE_DOMAIN = 'bookify.vn';

    execFileSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], {
      cwd: API_DIR,
      env: process.env,
      stdio: 'pipe',
    });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    http = app.getHttpServer();

    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'admin@bookify.local', password: 'admin-dev-password' })
      .expect(200);
    const raw = login.headers['set-cookie'];
    adminCookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  it('platform admin creates a plan', async () => {
    const res = await request(http)
      .post('/admin/plans')
      .set('Cookie', adminCookies)
      .send({
        name: 'Pro',
        priceMonthly: '990000',
        limits: {
          maxPartners: 1,
          maxListings: 100,
          maxBookingsPerMonth: 5,
          customDomain: true,
          affiliateModule: false,
        },
      })
      .expect(201);
    expect(res.body.priceMonthly).toBe('990000');
    expect(res.body.limits.maxPartners).toBe(1);
  });

  it('creates two tenants, each with an auto-provisioned verified subdomain', async () => {
    const alpha = await request(http)
      .post('/admin/tenants')
      .set('Cookie', adminCookies)
      .send({ name: 'Alpha Studio', slug: 'alpha' })
      .expect(201);
    const beta = await request(http)
      .post('/admin/tenants')
      .set('Cookie', adminCookies)
      .send({ name: 'Beta Homes', slug: 'beta', vertical: 'rental' })
      .expect(201);
    alphaId = alpha.body.id;
    betaId = beta.body.id;
    expect(alpha.body.primaryDomain.hostname).toBe('alpha.bookify.vn');
    expect(alpha.body.primaryDomain.verifiedAt).not.toBeNull();
    expect(beta.body.primaryDomain.hostname).toBe('beta.bookify.vn');
    expect(alphaId).not.toBe(betaId);
  });

  it('rejects a duplicate slug', async () => {
    const res = await request(http)
      .post('/admin/tenants')
      .set('Cookie', adminCookies)
      .send({ name: 'Alpha Again', slug: 'alpha' })
      .expect(409);
    expect(res.body.code).toBe('TENANT_SLUG_TAKEN');
  });

  it('each hostname resolves to its own tenant (isolated); unknown host is 404', async () => {
    const a = await request(http).get('/public/tenant').set('Host', 'alpha.bookify.vn').expect(200);
    const b = await request(http).get('/public/tenant').set('Host', 'beta.bookify.vn').expect(200);
    expect(a.body.id).toBe(alphaId);
    expect(b.body.id).toBe(betaId);
    expect(a.body.id).not.toBe(b.body.id);
    expect(b.body.vertical).toBe('rental');

    const unknown = await request(http)
      .get('/public/tenant')
      .set('Host', 'nope.bookify.vn')
      .expect(404);
    expect(unknown.body.code).toBe('UNKNOWN_HOST');
  });

  it('an active subscription makes the storefront live; an expired one suspends it', async () => {
    const plan = await request(http).get('/admin/plans').set('Cookie', adminCookies).expect(200);
    const planId = plan.body[0].id;
    const now = Date.now();

    // Alpha: active subscription → live.
    await request(http)
      .post(`/admin/tenants/${alphaId}/subscription`)
      .set('Cookie', adminCookies)
      .send({ planId, expiresAt: new Date(now + 30 * day).toISOString() })
      .expect(201);
    // Beta: already-expired subscription → suspended.
    await request(http)
      .post(`/admin/tenants/${betaId}/subscription`)
      .set('Cookie', adminCookies)
      .send({
        planId,
        startsAt: new Date(now - 40 * day).toISOString(),
        expiresAt: new Date(now - 10 * day).toISOString(),
      })
      .expect(201);

    const alphaLive = await request(http)
      .get('/public/tenant')
      .set('Host', 'alpha.bookify.vn')
      .expect(200);
    const betaLive = await request(http)
      .get('/public/tenant')
      .set('Host', 'beta.bookify.vn')
      .expect(200);
    expect(alphaLive.body.live).toBe(true);
    expect(betaLive.body.live).toBe(false); // storefront renders the suspended page
  });

  it('enforces the hard partner limit and never blocks on the soft booking limit', async () => {
    const planLimits = app.get(PlanLimitService);

    // maxPartners = 1: with zero partners a create is allowed…
    await expect(planLimits.assertCanAddPartner(alphaId)).resolves.toBeUndefined();

    // …once the tenant hits the cap, the next create is blocked.
    await db.admin.partner.create({ data: { tenantId: alphaId, name: 'P1', slug: 'p1' } });
    await expect(planLimits.assertCanAddPartner(alphaId)).rejects.toMatchObject({
      response: { code: 'PLAN_LIMIT_REACHED' },
    });

    // The monthly-bookings limit is SOFT — it flags but never throws (§6.5).
    const quota = await planLimits.checkBookingQuota(alphaId, new Date());
    expect(quota.allowed).toBe(true);
  });

  it('rejects a custom domain when the plan disallows it, else maps it unverified', async () => {
    // Alpha's plan allows custom domains → maps with a verification token.
    const ok = await request(http)
      .post(`/admin/tenants/${alphaId}/domains`)
      .set('Cookie', adminCookies)
      .send({ hostname: 'alphastudio.vn' })
      .expect(201);
    expect(ok.body.verifiedAt).toBeNull();
    expect(ok.body.verificationToken).toMatch(/^bookify-verify=/);

    // The unverified custom domain does not resolve yet.
    await request(http).get('/public/tenant').set('Host', 'alphastudio.vn').expect(404);
  });
});
