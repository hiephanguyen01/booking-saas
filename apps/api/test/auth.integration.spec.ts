import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';

/** Probe routes for the deny-by-default contract — test-only controller. */
@Controller('_probe')
class ProbeController {
  @Get('no-metadata')
  noMetadata() {
    return { reached: true };
  }
}

const API_DIR = path.resolve(__dirname, '..');

describe('auth & RBAC end-to-end', () => {
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
    process.env.SESSION_COOKIE_SECURE = 'false';
    process.env.OUTBOX_RELAY_DISABLED = 'true';

    execFileSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], {
      cwd: API_DIR,
      env: process.env,
      stdio: 'pipe',
    });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      // Rate limiting isn't under test here; a no-op storage keeps the many
      // logins this spec performs from tripping the per-route throttle.
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    http = app.getHttpServer();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  const cookiesOf = (res: request.Response): string[] => {
    const raw = res.headers['set-cookie'];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  };

  it('health endpoints are public and ready', async () => {
    await request(http).get('/health').expect(200);
    const ready = await request(http).get('/health/ready').expect(200);
    expect(ready.body).toMatchObject({ db: 'up', redis: 'up' });
  });

  it('register sets httpOnly session cookies and /auth/me works', async () => {
    const res = await request(http)
      .post('/auth/register')
      .send({ email: 'khach@example.com', password: 'strong-password-1', fullName: 'Khach Hang' })
      .expect(201);
    const cookies = cookiesOf(res);
    expect(cookies.some((c) => c.startsWith('sid=') && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith('rid=') && /Path=\/auth/i.test(c))).toBe(true);

    const me = await request(http).get('/auth/me').set('Cookie', cookies).expect(200);
    expect(me.body.email).toBe('khach@example.com');
  });

  it('rejects duplicate registration with EMAIL_TAKEN', async () => {
    const res = await request(http)
      .post('/auth/register')
      .send({ email: 'khach@example.com', password: 'strong-password-1', fullName: 'X' })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('locks the account after 5 wrong passwords', async () => {
    await request(http)
      .post('/auth/register')
      .send({ email: 'lockme@example.com', password: 'correct-password-1', fullName: 'Lock Me' })
      .expect(201);
    for (let i = 0; i < 5; i++) {
      await request(http)
        .post('/auth/login')
        .send({ email: 'lockme@example.com', password: 'wrong-password' })
        .expect(401);
    }
    const locked = await request(http)
      .post('/auth/login')
      .send({ email: 'lockme@example.com', password: 'correct-password-1' })
      .expect(403);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('refresh rotates tokens and the old refresh token stops working', async () => {
    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'khach@example.com', password: 'strong-password-1' })
      .expect(200);
    const oldCookies = cookiesOf(login);

    const refreshed = await request(http)
      .post('/auth/refresh')
      .set('Cookie', oldCookies)
      .expect(200);
    const newCookies = cookiesOf(refreshed);
    expect(newCookies.length).toBeGreaterThan(0);

    // replaying the pre-rotation refresh token must fail
    await request(http).post('/auth/refresh').set('Cookie', oldCookies).expect(401);
    // the rotated access cookie works
    await request(http).get('/auth/me').set('Cookie', newCookies).expect(200);
  });

  it('logout revokes the session', async () => {
    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'khach@example.com', password: 'strong-password-1' })
      .expect(200);
    const cookies = cookiesOf(login);
    await request(http).post('/auth/logout').set('Cookie', cookies).expect(204);
    await request(http).get('/auth/me').set('Cookie', cookies).expect(401);
  });

  it('unauthenticated requests to non-public routes get 401', async () => {
    await request(http).get('/_probe/no-metadata').expect(401);
  });

  it('deny-by-default: an authenticated route without declared permissions is 403', async () => {
    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'khach@example.com', password: 'strong-password-1' })
      .expect(200);
    const res = await request(http)
      .get('/_probe/no-metadata')
      .set('Cookie', cookiesOf(login))
      .expect(403);
    expect(res.body.code).toBe('NO_PERMISSION_DECLARED');
  });

  it('seeded platform admin resolves Super Admin permissions from role assignments', async () => {
    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'admin@bookify.local', password: 'admin-dev-password' })
      .expect(200);
    expect(login.body.user.email).toBe('admin@bookify.local');

    const assignments = await db.admin.roleAssignment.findMany({
      where: { user: { email: 'admin@bookify.local' } },
      include: { role: { include: { rolePermissions: true } } },
    });
    const keys = assignments.flatMap((a) => a.role.rolePermissions.map((rp) => rp.permissionKey));
    expect(keys).toContain('platform.tenants.write');
    expect(keys).toContain('platform.roles.manage');
  });

  it('GET /auth/session returns identity + resolved platform scope for the admin', async () => {
    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'admin@bookify.local', password: 'admin-dev-password' })
      .expect(200);
    const res = await request(http)
      .get('/auth/session')
      .set('Cookie', cookiesOf(login))
      .expect(200);

    expect(res.body.user.email).toBe('admin@bookify.local');
    const platform = res.body.scopes.find((s: { scope: string }) => s.scope === 'platform');
    expect(platform).toBeDefined();
    expect(platform.tenantId).toBeNull();
    expect(platform.partnerId).toBeNull();
    expect(platform.roles).toContain('Super Admin');
    expect(platform.permissions).toContain('platform.tenants.write');
  });

  it('GET /auth/session groups a partner membership with its tenant + partner', async () => {
    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'giang@giangstudio.vn', password: 'demo-password' })
      .expect(200);
    const res = await request(http)
      .get('/auth/session')
      .set('Cookie', cookiesOf(login))
      .expect(200);

    const partner = res.body.scopes.find((s: { scope: string }) => s.scope === 'partner');
    expect(partner).toBeDefined();
    expect(partner.tenantId).toBeTruthy();
    expect(partner.partnerId).toBeTruthy();
    expect(partner.partnerName).toBeTruthy();
    expect(partner.permissions).toContain('partner.availability.manage');
  });

  it('GET /auth/session requires authentication', async () => {
    await request(http).get('/auth/session').expect(401);
  });
});
