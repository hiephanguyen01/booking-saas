import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exists, readSource, repoPath } from './support/repo';

/**
 * Static RLS coverage (TONG-QUAN.md §6.4, ADR 0002).
 *
 * Every Prisma model carrying a `tenant_id` column must have, somewhere in
 * `apps/api/prisma/migrations/`, both:
 *   - `ALTER TABLE <t> FORCE ROW LEVEL SECURITY`
 *   - `CREATE POLICY ... ON <t>`
 * either as direct statements or as a `'<t>'` entry in a DO-block table array
 * whose loop applies FORCE RLS + CREATE POLICY (the 20260709 migration shape).
 *
 * Pure static analysis — the migrations are read as text, no database is opened.
 *
 * Known blind spot: a table without a `tenant_id` column is invisible here, so a
 * join table such as `role_permissions` is not covered by this guard even though
 * it is tenant-sensitive. Widening it needs a second source of truth for "which
 * tables are tenant-sensitive" and is deliberately left out of this conversion.
 */

const API_ROOT = repoPath('apps/api');

/** Tenant-scoped tables, read from schema.prisma. */
function tenantScopedTables(): string[] {
  const schema = readSource(join(API_ROOT, 'prisma', 'schema.prisma'));
  const tables: string[] = [];
  const modelRe = /^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelRe.exec(schema)) !== null) {
    const modelName = match[1];
    const body = match[2];
    if (!modelName || !body) continue;
    const hasTenantId = /@map\("tenant_id"\)/.test(body) || /^\s*tenant_id\s/m.test(body);
    if (!hasTenantId) continue;
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    tables.push(mapped?.[1] ?? modelName);
  }
  return tables.sort();
}

function migrationSql(): { readonly missing: string[]; readonly sql: string[] } {
  const migrationsDir = join(API_ROOT, 'prisma', 'migrations');
  const missing: string[] = [];
  const sql: string[] = [];
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(migrationsDir, entry.name, 'migration.sql');
    if (!exists(file)) {
      missing.push(`prisma/migrations/${entry.name}: directory has no migration.sql`);
      continue;
    }
    sql.push(readSource(file));
  }
  return { missing, sql };
}

const escape = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function coverage(table: string, sqlFiles: readonly string[]): { force: boolean; policy: boolean } {
  const directForce = new RegExp(
    `ALTER\\s+TABLE\\s+"?${escape(table)}"?\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  const directPolicy = new RegExp(
    `CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+"?${escape(table)}"?[\\s(]`,
    'i',
  );
  const arrayEntry = new RegExp(`'${escape(table)}'`);

  let force = false;
  let policy = false;
  for (const sql of sqlFiles) {
    const inLoopArray = arrayEntry.test(sql);
    if (directForce.test(sql) || (inLoopArray && /FORCE ROW LEVEL SECURITY/i.test(sql)))
      force = true;
    if (directPolicy.test(sql) || (inLoopArray && /CREATE POLICY/i.test(sql))) policy = true;
    if (force && policy) break;
  }
  return { force, policy };
}

describe('RLS coverage (ADR 0002)', () => {
  const tables = tenantScopedTables();
  const { missing, sql } = migrationSql();

  it('parses tenant-scoped models out of schema.prisma', () => {
    // A zero here means the parser broke, not that the schema is clean — without
    // this the whole guard would pass vacuously the day the schema format shifts.
    expect(tables.length).toBeGreaterThan(0);
  });

  it('reads every migration directory', () => {
    expect(missing).toEqual([]);
    expect(sql.length).toBeGreaterThan(0);
  });

  it('gives every tenant_id table FORCE RLS and a policy', () => {
    const offenders: string[] = [];
    for (const table of tables) {
      const { force, policy } = coverage(table, sql);
      if (!force) offenders.push(`${table} — no FORCE ROW LEVEL SECURITY in any migration`);
      else if (!policy) offenders.push(`${table} — no CREATE POLICY in any migration`);
    }
    // Fix: hand-write a migration with ENABLE + FORCE ROW LEVEL SECURITY and a
    // `tenant_isolation` policy (docs/data-model.md). Never `prisma migrate dev`.
    expect(offenders).toEqual([]);
  });
});
