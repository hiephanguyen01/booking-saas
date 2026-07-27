/**
 * Static RLS coverage check (TONG-QUAN.md §6.4) — replaces the integration test
 * that used to cover this, removed with the no-tests policy (ADR 0005).
 *
 * Every Prisma model carrying a `tenant_id` column must have, somewhere in
 * prisma/migrations/, both:
 *   - `ALTER TABLE <t> FORCE ROW LEVEL SECURITY`
 *   - `CREATE POLICY ... ON <t>`
 * either as direct statements or as a `'<t>'` entry in a DO-block table array
 * whose loop applies FORCE RLS + CREATE POLICY (the 20260709 migration shape).
 *
 * Pure static analysis — no database, no test framework. Run:
 *   pnpm --filter=@booking/api check:rls
 * Exits 1 listing the offending tables when coverage is missing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const apiRoot = join(__dirname, '..');

// ── 1. Tenant-scoped tables from schema.prisma ──────────────────────────────
const schema = readFileSync(join(apiRoot, 'prisma', 'schema.prisma'), 'utf8');

const tables: string[] = [];
const modelRe = /^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm;
let match: RegExpExecArray | null;
while ((match = modelRe.exec(schema)) !== null) {
  const [, modelName, body] = match;
  const hasTenantId = /@map\("tenant_id"\)/.test(body) || /^\s*tenant_id\s/m.test(body);
  if (!hasTenantId) continue;
  const mapped = /@@map\("([^"]+)"\)/.exec(body);
  tables.push(mapped ? mapped[1] : modelName);
}

if (tables.length === 0) {
  console.error('check-rls: parsed 0 tenant-scoped models from schema.prisma — parser broken?');
  process.exit(1);
}

// ── 2. All migration SQL ─────────────────────────────────────────────────────
const migrationsDir = join(apiRoot, 'prisma', 'migrations');
const sqlFiles = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(join(migrationsDir, entry.name, 'migration.sql'), 'utf8'));

// ── 3. Coverage: direct statements or DO-block array membership ─────────────
const esc = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isCovered(table: string): { force: boolean; policy: boolean } {
  const directForce = new RegExp(
    `ALTER\\s+TABLE\\s+"?${esc(table)}"?\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  const directPolicy = new RegExp(`CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+"?${esc(table)}"?[\\s(]`, 'i');
  const arrayEntry = new RegExp(`'${esc(table)}'`);

  let force = false;
  let policy = false;
  for (const sql of sqlFiles) {
    const inLoopArray = arrayEntry.test(sql);
    if (directForce.test(sql) || (inLoopArray && /FORCE ROW LEVEL SECURITY/i.test(sql))) force = true;
    if (directPolicy.test(sql) || (inLoopArray && /CREATE POLICY/i.test(sql))) policy = true;
    if (force && policy) break;
  }
  return { force, policy };
}

const offenders: { table: string; problem: string }[] = [];
for (const table of tables.sort()) {
  const { force, policy } = isCovered(table);
  if (!force) offenders.push({ table, problem: 'no FORCE ROW LEVEL SECURITY in any migration' });
  else if (!policy) offenders.push({ table, problem: 'no CREATE POLICY in any migration' });
}

if (offenders.length > 0) {
  console.error(`check-rls: ${offenders.length} tenant-scoped table(s) missing RLS coverage:\n`);
  for (const { table, problem } of offenders) console.error(`  ✗ ${table} — ${problem}`);
  console.error(
    '\nEvery table with a tenant_id column needs a hand-written migration with\n' +
      'ENABLE + FORCE ROW LEVEL SECURITY and a tenant_isolation policy (CLAUDE.md §13 cookbook).',
  );
  process.exit(1);
}

console.log(`check-rls: OK — ${tables.length} tenant-scoped tables all have FORCE RLS + policy.`);
