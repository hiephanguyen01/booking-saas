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
const apiServerPath = 'apps/storefront/app/lib/server/api.server.ts';
const envServerPath = 'apps/storefront/app/lib/server/env.server.ts';
const formRequestServerPath = 'apps/storefront/app/lib/server/form-request.server.ts';
const genericFormPath = 'packages/ui/src/components/form/generic-form.tsx';
const requestSecurityServerPath =
  'apps/storefront/app/features/root/server/request-security.server.ts';
const tenantServerPath = 'apps/storefront/app/lib/server/tenant.server.ts';
const directFetchAllowlist = new Set([
  'apps/storefront/app/features/root/server/readiness.server.ts',
]);
const directFormDataAllowlist = new Set([formRequestServerPath]);
let tenantResolutionCallSites = 0;

for (const file of storefrontFiles) {
  const path = relative(root, file);
  const source = readFileSync(file, 'utf8');

  if (/\bfetch\s*\(/.test(source) && !directFetchAllowlist.has(path)) {
    failures.push(`${path}: direct fetch is forbidden; use ${apiServerPath}`);
  }
  if (/\brequest\.formData\s*\(/.test(source) && !directFormDataAllowlist.has(path)) {
    failures.push(`${path}: direct formData parsing is forbidden; use ${formRequestServerPath}`);
  }
  if (source.includes('process.env') && path !== envServerPath) {
    failures.push(`${path}: read runtime environment through env.server.ts`);
  }
  if (/http:\/\/localhost:(3000|5174)/.test(source) && path !== envServerPath) {
    failures.push(`${path}: production-sensitive localhost fallback`);
  }
  if (path.endsWith('/request-auth.server.ts')) {
    failures.push(`${path}: use request-context.server.ts; compatibility shims are forbidden`);
  }
  const tenantResolutionCalls = source.match(/\bresolveStorefront\s*\(/g) ?? [];
  if (path === requestSecurityServerPath) {
    tenantResolutionCallSites += tenantResolutionCalls.length;
  } else if (path !== tenantServerPath && tenantResolutionCalls.length > 0) {
    failures.push(
      `${path}: resolve storefront only in request-security.server.ts; use the request context`,
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

  const protectsAuthCredentials =
    path.startsWith('apps/storefront/app/features/auth/components/') ||
    path === 'apps/storefront/app/features/partner-onboarding/components/partner-verify-page.tsx';
  if (protectsAuthCredentials) {
    for (const formTag of source.match(/<form\b[^>]*>/g) ?? []) {
      if (!/\bmethod=["']post["']/i.test(formTag)) {
        failures.push(`${path}: auth forms must declare a native POST fallback`);
      }
    }
  }
}

const genericFormSource = readFileSync(join(root, genericFormPath), 'utf8');
for (const formTag of genericFormSource.match(/<form\b[^>]*>/g) ?? []) {
  if (!/\bmethod=["']post["']/i.test(formTag)) {
    failures.push(`${genericFormPath}: shared forms must declare a native POST fallback`);
  }
}

if (tenantResolutionCallSites !== 1) {
  failures.push(
    `${requestSecurityServerPath}: expected exactly one resolveStorefront() call, found ${tenantResolutionCallSites}`,
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
