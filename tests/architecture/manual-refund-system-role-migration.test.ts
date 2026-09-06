import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Manual Refund V2 system-role migrate deploy', () => {
  it('grants the workflow permissions to the tenant system roles during migrate deploy', () => {
    const migrationsDir = join(import.meta.dirname, '../../apps/api/prisma/migrations');
    const sql = readdirSync(migrationsDir)
      .filter((migration) => /^\d/.test(migration))
      .sort()
      .map((migration) => readFileSync(join(migrationsDir, migration, 'migration.sql'), 'utf8'))
      .join('\n');

    for (const permission of [
      'tenant.refunds.prepare',
      'tenant.refunds.approve',
      'tenant.refunds.reveal',
    ]) {
      expect(sql).toContain(`('${permission}', 'tenant')`);
    }

    expect(sql).toContain("('platform.refunds.break_glass', 'platform')");
    expect(sql).toMatch(/r\.name = 'Super Admin'[\s\S]*platform\.refunds\.break_glass/);
    expect(sql).toMatch(/r\.name IN \('Tenant Owner', 'Manager'\)[\s\S]*tenant\.refunds\.prepare/);
    expect(sql).toMatch(/r\.name = 'Finance'[\s\S]*tenant\.refunds\.approve/);
  });
});
