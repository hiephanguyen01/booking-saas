import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';

/**
 * CI RLS check (TONG-QUAN.md §6.4): every table with a tenant_id column must
 * have FORCE ROW LEVEL SECURITY and at least one policy. Fails the build when
 * a new tenant-scoped table forgets the hand-written RLS migration.
 */
describe('RLS coverage', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
  });

  it('every table with a tenant_id column has FORCE RLS + a policy', async () => {
    const offenders = await db.root.$queryRaw<{ table_name: string; problem: string }[]>`
      SELECT c.table_name::text,
             CASE
               WHEN NOT t.relrowsecurity THEN 'RLS not enabled'
               WHEN NOT t.relforcerowsecurity THEN 'RLS not forced'
               WHEN p.policy_count = 0 THEN 'no policy'
             END AS problem
      FROM information_schema.columns c
      JOIN pg_class t ON t.relname = c.table_name
        AND t.relnamespace = 'public'::regnamespace
      LEFT JOIN LATERAL (
        SELECT count(*) AS policy_count
        FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.tablename = c.table_name
      ) p ON true
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenant_id'
        AND c.table_name NOT LIKE '\_prisma%'
        AND (NOT t.relrowsecurity OR NOT t.relforcerowsecurity OR p.policy_count = 0)
    `;
    expect(offenders).toEqual([]);
  });
});
