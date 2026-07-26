import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const failures = [];
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'build',
  'dist',
  '.react-router',
  'coverage',
  'test-results',
]);
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

const storefrontRoot = join(root, 'apps/storefront/app');
const storefrontFiles = walk(storefrontRoot).filter((file) => sourceExtensions.has(extname(file)));
const directFetchAllowlist = new Set(['apps/storefront/app/routes/readyz.ts']);
const directFormDataAllowlist = new Set(['apps/storefront/app/lib/form-request.server.ts']);
let tenantResolutionCallSites = 0;

for (const file of storefrontFiles) {
  const path = relative(root, file);
  const source = readFileSync(file, 'utf8');

  if (/\bfetch\s*\(/.test(source) && !directFetchAllowlist.has(path)) {
    failures.push(
      `${path}: direct fetch is forbidden; use apps/storefront/app/lib/api.server.ts`,
    );
  }
  if (/\brequest\.formData\s*\(/.test(source) && !directFormDataAllowlist.has(path)) {
    failures.push(
      `${path}: direct formData parsing is forbidden; use apps/storefront/app/lib/form-request.server.ts`,
    );
  }
  if (source.includes('process.env') && !path.endsWith('/lib/env.server.ts')) {
    failures.push(`${path}: read runtime environment through env.server.ts`);
  }
  if (/http:\/\/localhost:(3000|5174)/.test(source) && !path.endsWith('/lib/env.server.ts')) {
    failures.push(`${path}: production-sensitive localhost fallback`);
  }
  if (path.endsWith('/lib/request-auth.server.ts')) {
    failures.push(`${path}: use request-context.server.ts; compatibility shims are forbidden`);
  }
  const tenantResolutionCalls = source.match(/\bresolveTenant\s*\(/g) ?? [];
  if (path.endsWith('/lib/request-security.server.ts')) {
    tenantResolutionCallSites += tenantResolutionCalls.length;
  } else if (!path.endsWith('/lib/tenant.server.ts') && tenantResolutionCalls.length > 0) {
    failures.push(
      `${path}: resolve tenant only in request-security.server.ts; use getCurrentStorefrontTenant()`,
    );
  }
  for (const form of source.matchAll(/<Form\b[^>]*method=["']get["'][^>]*>[\s\S]*?<\/Form>/gi)) {
    if (/name=["'](otp|token|password|challengeId)["']/i.test(form[0])) {
      failures.push(`${path}: sensitive form field would be serialized into a browser URL`);
    }
  }

  if (/[?&](otp|token|password|challengeId)=/.test(source)) {
    failures.push(`${path}: sensitive credential encoded in a URL`);
  }
}

if (tenantResolutionCallSites !== 1) {
  failures.push(
    `apps/storefront/app/lib/request-security.server.ts: expected exactly one resolveTenant() call, found ${tenantResolutionCallSites}`,
  );
}

if (failures.length > 0) {
  console.error(
    ['Storefront security check failed:', ...failures.map((item) => `- ${item}`)].join('\n'),
  );
  process.exit(1);
}

console.log(
  'Storefront security check passed (bounded form parsing enforced; sensitive credentials are forbidden in URLs).',
);
