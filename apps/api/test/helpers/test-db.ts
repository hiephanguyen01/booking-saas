import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  /** superuser client (owns the schema, bypasses nothing — it is the owner) */
  root: PrismaClient;
  /** RLS-bound pool (Postgres role app_user) */
  app: PrismaClient;
  /** BYPASSRLS pool (Postgres role app_admin) */
  admin: PrismaClient;
  stop(): Promise<void>;
}

const API_DIR = path.resolve(__dirname, '..', '..');

function url(c: StartedPostgreSqlContainer, user: string, password: string): string {
  return `postgresql://${user}:${password}@${c.getHost()}:${c.getMappedPort(5432)}/${c.getDatabase()}`;
}

/** Boots postgres:16, applies all Prisma migrations, returns the three pools. */
export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const migrateUrl = container.getConnectionUri();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, MIGRATE_DATABASE_URL: migrateUrl },
    stdio: 'pipe',
  });

  const make = (u: string) => new PrismaClient({ datasources: { db: { url: u } } });
  const root = make(migrateUrl);
  const app = make(url(container, 'app_user', 'app_user_dev_pw'));
  const admin = make(url(container, 'app_admin', 'app_admin_dev_pw'));

  return {
    container,
    root,
    app,
    admin,
    async stop() {
      await Promise.allSettled([root.$disconnect(), app.$disconnect(), admin.$disconnect()]);
      await container.stop();
    },
  };
}

/** The forTenant pattern from shared/tenant-context, usable against any client. */
export async function forTenant<T>(
  client: PrismaClient,
  tenantId: string,
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
