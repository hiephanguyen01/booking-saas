import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';
import { PartnerVerificationService } from '../src/modules/partner/application/services/partner-verification.service';

const API_DIR = path.resolve(__dirname, '..');

async function login(
  http: ReturnType<INestApplication['getHttpServer']>,
  email: string,
  password: string,
): Promise<string[]> {
  const res = await request(http).post('/auth/login').send({ email, password }).expect(200);
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

/**
 * Task 1.2 DoD (TONG-QUAN.md §7): a partner goes signup → approved → verified;
 * fee-schedule acceptance is recorded at approval; under-18 / name-mismatch are
 * blocked; an unverified partner cannot serve a people-booking listing type.
 */
describe('partner onboarding & verification', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let modelTypeId: string;
  let ownerCookies: string[];
  let customerCookies: string[];
  let partnerId: string;

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
    process.env.SEED_DEMO = 'true';
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

    const tenant = await db.admin.tenant.findFirstOrThrow({ where: { slug: 'studiohub' } });
    tenantId = tenant.id;
    const modelType = await db.admin.listingType.findFirstOrThrow({
      where: { tenantId, slug: 'model' },
    });
    modelTypeId = modelType.id;

    ownerCookies = await login(http, 'owner@studiohub.vn', 'demo-password');
    customerCookies = await login(http, 'customer@studiohub.vn', 'demo-password');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  async function applyAsPartner(slug: string, name: string): Promise<string> {
    const res = await request(http)
      .post('/partners/apply')
      .set('Cookie', customerCookies)
      .send({ tenantId, name, slug, partnerType: 'individual' })
      .expect(201);
    return res.body.id;
  }

  it('a user applies and the tenant sees it in the pending queue', async () => {
    partnerId = await applyAsPartner('candid-studio', 'Candid Studio');

    const list = await request(http)
      .get('/tenant/partners?status=pending')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const applied = list.body.items.find((p: { id: string }) => p.id === partnerId);
    expect(applied).toBeDefined();
    expect(applied.status).toBe('pending');
    // the pending individual partner from the seed is in the queue too
    expect(list.body.items.some((p: { slug: string }) => p.slug === 'trang-makeup')).toBe(true);
  });

  it('denies partner management to a user without the tenant role', async () => {
    await request(http)
      .get('/tenant/partners')
      .set('Cookie', customerCookies)
      .set('x-tenant-id', tenantId)
      .expect(403);
  });

  it('the tenant admin creates a house partner (approved, no verification needed)', async () => {
    const res = await request(http)
      .post('/tenant/partners/house')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ name: 'House Two', slug: 'house-two' })
      .expect(201);
    expect(res.body.isHouse).toBe(true);
    expect(res.body.status).toBe('approved');
  });

  it('partner sets payout + submits identity, tenant approves (records agreements) and verifies', async () => {
    await request(http)
      .patch('/partner/profile/payout')
      .set('Cookie', customerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', partnerId)
      .send({ bank: 'ACB', accountNumber: '111222333', holderName: 'NGUYEN VAN KHACH' })
      .expect(200);

    const idRes = await request(http)
      .post('/partner/profile/identity')
      .set('Cookie', customerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', partnerId)
      .send({
        documentType: 'national_id',
        documentNumber: '079200000001',
        holderName: 'Nguyen Van Khach',
        dateOfBirth: '2000-01-01',
      })
      .expect(200);
    expect(idRes.body.verificationStatus).toBe('pending');

    const approved = await request(http)
      .post(`/tenant/partners/${partnerId}/approve`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({})
      .expect(200);
    expect(approved.body.status).toBe('approved');

    const agreements = await db.admin.agreementAcceptance.findMany({ where: { partnerId } });
    expect(agreements.map((a) => a.agreementType).sort()).toEqual([
      'commission_schedule',
      'partner_terms',
    ]);

    const verified = await request(http)
      .post(`/tenant/partners/${partnerId}/verify`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({})
      .expect(200);
    expect(verified.body.verificationStatus).toBe('verified');
    expect(verified.body.verifiedAt).not.toBeNull();
  });

  it('blocks verification of an under-18 applicant and marks it rejected', async () => {
    const minorId = await applyAsPartner('minor-model', 'Minor Model');
    await request(http)
      .patch('/partner/profile/payout')
      .set('Cookie', customerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', minorId)
      .send({ bank: 'ACB', accountNumber: '1', holderName: 'MINOR PERSON' })
      .expect(200);
    await request(http)
      .post('/partner/profile/identity')
      .set('Cookie', customerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', minorId)
      .send({
        documentType: 'national_id',
        documentNumber: '1',
        holderName: 'MINOR PERSON',
        dateOfBirth: '2012-01-01',
      })
      .expect(200);

    const res = await request(http)
      .post(`/tenant/partners/${minorId}/verify`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({})
      .expect(403);
    expect(res.body.code).toBe('UNDER_18');

    const partner = await db.admin.partner.findUniqueOrThrow({ where: { id: minorId } });
    expect(partner.verificationStatus).toBe('rejected');
  });

  it('blocks verification when the ID name does not match the payout holder', async () => {
    const mismatchId = await applyAsPartner('mismatch-model', 'Mismatch Model');
    await request(http)
      .patch('/partner/profile/payout')
      .set('Cookie', customerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', mismatchId)
      .send({ bank: 'ACB', accountNumber: '1', holderName: 'ALICE NGUYEN' })
      .expect(200);
    await request(http)
      .post('/partner/profile/identity')
      .set('Cookie', customerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', mismatchId)
      .send({
        documentType: 'national_id',
        documentNumber: '1',
        holderName: 'BOB TRAN',
        dateOfBirth: '1998-03-03',
      })
      .expect(200);

    const res = await request(http)
      .post(`/tenant/partners/${mismatchId}/verify`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({})
      .expect(403);
    expect(res.body.code).toBe('NAME_MISMATCH');
  });

  it('the verification gate blocks an unverified partner from a people-booking type', async () => {
    const svc = app.get(PartnerVerificationService);
    const model = await db.admin.listingType.findUniqueOrThrow({ where: { id: modelTypeId } });
    expect(model.requiresIdentityVerification).toBe(true);
    const gate = { requiresIdentityVerification: model.requiresIdentityVerification };

    const verified = await db.admin.partner.findUniqueOrThrow({ where: { id: partnerId } });
    expect(() =>
      svc.assertCanServeListingType({ verificationStatus: verified.verificationStatus }, gate),
    ).not.toThrow();

    let code: string | undefined;
    try {
      svc.assertCanServeListingType({ verificationStatus: 'pending' }, gate);
    } catch (err) {
      code = (err as { response?: { code?: string } }).response?.code;
    }
    expect(code).toBe('PARTNER_NOT_VERIFIED');

    // A resource (non people-booking) type is open to any partner.
    expect(() =>
      svc.assertCanServeListingType(
        { verificationStatus: 'unsubmitted' },
        { requiresIdentityVerification: false },
      ),
    ).not.toThrow();
  });
});
