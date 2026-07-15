import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';

const API_DIR = path.resolve(__dirname, '..');

describe('Vietnamese administrative divisions', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    db = await startTestDb();
    redis = await new RedisContainer('redis:7').start();

    const base = db.container;
    process.env.DATABASE_URL = `postgresql://app_user:app_user_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.ADMIN_DATABASE_URL = `postgresql://app_admin:app_admin_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.MIGRATE_DATABASE_URL = base.getConnectionUri();
    process.env.REDIS_URL = redis.getConnectionUrl();
    process.env.OUTBOX_RELAY_DISABLED = 'true';
    process.env.SEED_DEMO = 'false';

    execFileSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], {
      cwd: API_DIR,
      env: process.env,
      stdio: 'pipe',
    });
    // The production-required fixture must be safe to run more than once.
    execFileSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], {
      cwd: API_DIR,
      env: process.env,
      stdio: 'pipe',
    });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  it('seeds the complete Decision 19/2025 catalog without duplicates', async () => {
    await expect(db.root.administrativeProvince.count()).resolves.toBe(34);
    await expect(db.root.administrativeWard.count()).resolves.toBe(3321);

    const baDinh = await db.root.administrativeWard.findUniqueOrThrow({
      where: { code: '00004' },
    });
    expect(baDinh).toMatchObject({
      provinceCode: '01',
      name: 'Phường Ba Đình',
      effectiveFrom: new Date('2025-07-01T00:00:00.000Z'),
    });
  });

  it('lists provinces publicly in official order with cache headers', async () => {
    const response = await request(http)
      .get('/public/administrative-divisions/provinces')
      .expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=86400');
    expect(response.body).toHaveLength(34);
    expect(response.body[0]).toEqual({
      code: '01',
      name: 'Thành phố Hà Nội',
      type: 'municipality',
    });
  });

  it('only lists wards from the requested province', async () => {
    const response = await request(http)
      .get('/public/administrative-divisions/wards?provinceCode=79')
      .expect(200);

    expect(response.body).toHaveLength(168);
    expect(
      response.body.every((ward: { provinceCode: string }) => ward.provinceCode === '79'),
    ).toBe(true);
    expect(response.body).toContainEqual({
      code: '26740',
      provinceCode: '79',
      name: 'Phường Sài Gòn',
      type: 'ward',
    });
  });

  it('rejects malformed codes and returns an empty list for an unknown valid code', async () => {
    await request(http).get('/public/administrative-divisions/wards?provinceCode=1').expect(400);
    const unknown = await request(http)
      .get('/public/administrative-divisions/wards?provinceCode=99')
      .expect(200);
    expect(unknown.body).toEqual([]);
  });
});
