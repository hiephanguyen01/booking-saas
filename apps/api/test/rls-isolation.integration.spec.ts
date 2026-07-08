import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forTenant, startTestDb, type TestDb } from './helpers/test-db';

/**
 * The mandatory isolation test (TONG-QUAN.md §6.4): tenant A can never read or
 * write tenant B's rows, even when the code forgets a `where tenant_id`.
 */
describe('RLS tenant isolation', () => {
  let db: TestDb;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    db = await startTestDb();
    const a = await db.admin.tenant.create({ data: { name: 'Tenant A', slug: 'tenant-a' } });
    const b = await db.admin.tenant.create({ data: { name: 'Tenant B', slug: 'tenant-b' } });
    tenantA = a.id;
    tenantB = b.id;
    await db.admin.tenantDomain.createMany({
      data: [
        { tenantId: tenantA, hostname: 'a.example.com', isPrimary: true },
        { tenantId: tenantB, hostname: 'b.example.com', isPrimary: true },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
  });

  it('a findMany without any where clause only returns the current tenant rows', async () => {
    const rows = await forTenant(db.app, tenantA, (tx) => tx.tenantDomain.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hostname).toBe('a.example.com');
  });

  it('tenant A cannot read tenant B rows even when explicitly asked', async () => {
    const rows = await forTenant(db.app, tenantA, (tx) =>
      tx.tenantDomain.findMany({ where: { tenantId: tenantB } }),
    );
    expect(rows).toHaveLength(0);
  });

  it('tenant A cannot update tenant B rows (0 rows affected)', async () => {
    const result = await forTenant(db.app, tenantA, (tx) =>
      tx.tenantDomain.updateMany({
        where: { hostname: 'b.example.com' },
        data: { isPrimary: false },
      }),
    );
    expect(result.count).toBe(0);
    const untouched = await db.admin.tenantDomain.findUnique({
      where: { hostname: 'b.example.com' },
    });
    expect(untouched?.isPrimary).toBe(true);
  });

  it('tenant A cannot insert rows pretending to be tenant B', async () => {
    await expect(
      forTenant(db.app, tenantA, (tx) =>
        tx.tenantDomain.create({
          data: { tenantId: tenantB, hostname: 'evil.example.com' },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a query without tenant context fails loudly instead of leaking', async () => {
    await expect(db.app.tenantDomain.findMany()).rejects.toThrow();
  });

  it('the app_admin pool bypasses RLS for platform work', async () => {
    const rows = await db.admin.tenantDomain.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
