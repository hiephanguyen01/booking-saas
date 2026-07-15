import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';
import { AttributeValidatorService } from '../src/modules/catalog/application/services/attribute-validator.service';

const API_DIR = path.resolve(__dirname, '..');
const HOST = 'studiohub.bookify.vn';

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
 * Task 1.3 DoD (TONG-QUAN.md §7/§16): tenants define listing types with typed
 * attribute schemas; the storefront menu + attr.* filters generate from them.
 */
describe('dynamic listing types', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let ownerCookies: string[];

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

    tenantId = (await db.admin.tenant.findFirstOrThrow({ where: { slug: 'studiohub' } })).id;
    ownerCookies = await login(http, 'owner@studiohub.vn', 'demo-password');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  let createdId: string;

  it('creates a listing type with a typed attribute schema', async () => {
    const res = await request(http)
      .post('/tenant/listing-types')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({
        name: 'Makeup',
        slug: 'makeup',
        allowedModes: ['appointment', 'hourly'],
        defaultModes: ['appointment'],
        unitLabel: 'buổi',
        sortOrder: 5,
        attributeSchema: [
          { key: 'specialty', label: 'Chuyên môn', type: 'select', filterable: true, options: ['Cô dâu', 'Dự tiệc'] },
          { key: 'travels', label: 'Nhận đi tỉnh', type: 'boolean', filterable: true },
        ],
      })
      .expect(201);
    expect(res.body.slug).toBe('makeup');
    expect(res.body.isActive).toBe(true);
    createdId = res.body.id;
  });

  it('rejects a duplicate slug and an invalid defaultModes subset', async () => {
    const dup = await request(http)
      .post('/tenant/listing-types')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Studio 2', slug: 'studio', allowedModes: ['hourly'] })
      .expect(409);
    expect(dup.body.code).toBe('LISTING_TYPE_SLUG_TAKEN');

    const bad = await request(http)
      .post('/tenant/listing-types')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Bad', slug: 'bad-type', allowedModes: ['hourly'], defaultModes: ['daily'] })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('lists types and updates one', async () => {
    const list = await request(http)
      .get('/tenant/listing-types')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .expect(200);
    expect(list.body.map((t: { slug: string }) => t.slug)).toEqual(
      expect.arrayContaining(['studio', 'model', 'equipment', 'makeup']),
    );

    const updated = await request(http)
      .patch(`/tenant/listing-types/${createdId}`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ sortOrder: 9, isActive: false })
      .expect(200);
    expect(updated.body.sortOrder).toBe(9);
    expect(updated.body.isActive).toBe(false);
  });

  it('blocks deleting a type that still has listings, allows deleting an unused one', async () => {
    const list = await request(http)
      .get('/tenant/listing-types')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .expect(200);
    const studioId = list.body.find((t: { slug: string }) => t.slug === 'studio').id;

    const blocked = await request(http)
      .delete(`/tenant/listing-types/${studioId}`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .expect(409);
    expect(blocked.body.code).toBe('LISTING_TYPE_IN_USE');

    await request(http)
      .delete(`/tenant/listing-types/${createdId}`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .expect(204);
  });

  it('serves the public menu (active, by sortOrder, filterable fields only)', async () => {
    const res = await request(http).get('/public/listing-types').set('Host', HOST).expect(200);
    const slugs = res.body.map((t: { slug: string }) => t.slug);
    expect(slugs).toEqual(expect.arrayContaining(['studio', 'model', 'equipment']));
    // ordering by sortOrder (studio=1, model=2, equipment=3)
    expect(slugs.indexOf('studio')).toBeLessThan(slugs.indexOf('model'));

    // the model type's non-filterable `portfolio` field is stripped from the menu
    const model = res.body.find((t: { slug: string }) => t.slug === 'model');
    const modelKeys = model.attributeSchema.map((f: { key: string }) => f.key);
    expect(modelKeys).toContain('height');
    expect(modelKeys).not.toContain('portfolio');
  });

  it('filters public listings by type + attr.*', async () => {
    const all = await request(http)
      .get('/public/listings?type=studio')
      .set('Host', HOST)
      .expect(200);
    // Published children of the same group are consolidated into one catalog card.
    expect(all.body.length).toBeGreaterThanOrEqual(1);
    expect(all.body[0]).toMatchObject({
      wardName: 'Phường Sài Gòn',
      provinceName: 'Thành phố Hồ Chí Minh',
    });

    const vintage = await request(http)
      .get('/public/listings?type=studio&attr.style=Vintage')
      .set('Host', HOST)
      .expect(200);
    expect(vintage.body.map((l: { slug: string }) => l.slug)).toEqual(['giang-studio-q1']);
    expect(vintage.body[0].priceFrom).toBe('250000');
  });

  it('the attribute validator rejects bad values (reused by Task 1.4)', () => {
    const svc = app.get(AttributeValidatorService);
    const schema = [
      { key: 'area', label: 'Area', type: 'number' as const, required: true, filterable: true },
    ];
    expect(() => svc.assertValidAttributes(schema, { area: 40 })).not.toThrow();
    let code: string | undefined;
    try {
      svc.assertValidAttributes(schema, { area: 'nope' });
    } catch (err) {
      code = (err as { response?: { code?: string } }).response?.code;
    }
    expect(code).toBe('INVALID_ATTRIBUTES');
  });
});
