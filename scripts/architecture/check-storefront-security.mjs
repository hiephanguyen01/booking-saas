import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const failures = [];
const ignoredDirectories = new Set(['.git', 'node_modules', 'build', 'dist', '.react-router']);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const repositoryFiles = walk(root);
for (const file of repositoryFiles) {
  const path = relative(root, file);
  if (/(^|\/)(test-results|e2e)(\/|$)/.test(path)) {
    failures.push(`${path}: forbidden test artifact directory`);
  }
  if (/\.(spec|test)\.[^.]+$/.test(path) || /(^|\/)(vitest|playwright)\.config\./.test(path)) {
    failures.push(`${path}: forbidden test file or configuration`);
  }
}

const storefrontRoot = join(root, 'apps/storefront/app');
const storefrontFiles = walk(storefrontRoot).filter((file) => sourceExtensions.has(extname(file)));
let otpCompatibilityExceptions = 0;

for (const file of storefrontFiles) {
  const path = relative(root, file);
  const source = readFileSync(file, 'utf8');

  if (source.includes('process.env') && !path.endsWith('/lib/env.server.ts')) {
    failures.push(`${path}: read runtime environment through env.server.ts`);
  }
  if (/http:\/\/localhost:(3000|5174)/.test(source) && !path.endsWith('/lib/env.server.ts')) {
    failures.push(`${path}: production-sensitive localhost fallback`);
  }
  for (const form of source.matchAll(/<Form\b[^>]*method=["']get["'][^>]*>[\s\S]*?<\/Form>/gi)) {
    if (/name=["'](otp|token|password|challengeId)["']/i.test(form[0])) {
      failures.push(`${path}: sensitive form field would be serialized into a browser URL`);
    }
  }

  const sensitiveUrl = /[?&](otp|token|password|challengeId)=/g;
  const matches = [...source.matchAll(sensitiveUrl)];
  if (matches.length === 0) continue;
  const approvedCompatibilityDebt =
    path === 'apps/storefront/app/lib/booking.server.ts' &&
    source.includes('SECURITY_EXCEPTION API-DEP-01');
  if (approvedCompatibilityDebt) otpCompatibilityExceptions += matches.length;
  else failures.push(`${path}: sensitive credential encoded in a URL`);
}

if (otpCompatibilityExceptions !== 1) {
  failures.push(
    'apps/storefront/app/lib/booking.server.ts: expected exactly one documented API-DEP-01 compatibility exception',
  );
}

if (failures.length > 0) {
  console.error(
    ['Storefront security check failed:', ...failures.map((item) => `- ${item}`)].join('\n'),
  );
  process.exit(1);
}

console.log(
  'Storefront security check passed (one server-to-server OTP URL exception remains blocked on API-DEP-01).',
);
