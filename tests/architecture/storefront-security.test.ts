import { describe, expect, it } from 'vitest';
import { loadSources, readSource, repoPath } from './support/repo';

/**
 * The storefront's security gate.
 *
 * Everything here is a rule the type system cannot express: the storefront is
 * public, multi-tenant and reachable by any host, so a single browser-side fetch,
 * an unbounded `request.formData()`, a stray `process.env` read or a credential
 * in a URL is a real exposure rather than a style problem.
 */

const APP_ROOT = 'apps/storefront/app';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const apiServerPath = 'apps/storefront/app/lib/server/api.server.ts';
const envServerPath = 'apps/storefront/app/lib/server/env.server.ts';
const formRequestServerPath = 'apps/storefront/app/lib/server/form-request.server.ts';
const genericFormPath = 'packages/ui/src/components/form/generic-form.tsx';
const requestSecurityServerPath =
  'apps/storefront/app/features/root/server/request-security.server.ts';
const tenantServerPath = 'apps/storefront/app/lib/server/tenant.server.ts';

/** Readiness probes the API directly: they must answer even when the BFF client cannot. */
const directFetchAllowlist = new Set([
  'apps/storefront/app/features/root/server/readiness.server.ts',
]);
/** The bounded parser is itself the one module allowed to touch the raw body. */
const directFormDataAllowlist = new Set([formRequestServerPath]);

const files = loadSources(repoPath(APP_ROOT), SOURCE_EXTENSIONS);

/** Auth screens post credentials; they must work with JavaScript disabled. */
function protectsAuthCredentials(path: string): boolean {
  return (
    path.startsWith('apps/storefront/app/features/auth/components/') ||
    path === 'apps/storefront/app/features/partner-onboarding/components/partner-verify-page.tsx'
  );
}

describe('storefront security gate', () => {
  it('scans the storefront app', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never fetches the backend outside the server API client', () => {
    expect(
      files
        .filter(
          ({ path, source }) => /\bfetch\s*\(/.test(source) && !directFetchAllowlist.has(path),
        )
        .map(({ path }) => `${path}: direct fetch is forbidden; use ${apiServerPath}`),
    ).toEqual([]);
  });

  it('parses form bodies only through the bounded parser', () => {
    expect(
      files
        .filter(
          ({ path, source }) =>
            /\brequest\.formData\s*\(/.test(source) && !directFormDataAllowlist.has(path),
        )
        .map(
          ({ path }) =>
            `${path}: direct formData parsing is forbidden; use ${formRequestServerPath}`,
        ),
    ).toEqual([]);
  });

  it('reads runtime environment only through env.server.ts', () => {
    expect(
      files
        .filter(({ path, source }) => source.includes('process.env') && path !== envServerPath)
        .map(({ path }) => `${path}: read runtime environment through env.server.ts`),
    ).toEqual([]);
  });

  it('hides no production-sensitive localhost fallback', () => {
    expect(
      files
        .filter(
          ({ path, source }) =>
            /http:\/\/localhost:(3000|5174)/.test(source) && path !== envServerPath,
        )
        .map(({ path }) => `${path}: production-sensitive localhost fallback`),
    ).toEqual([]);
  });

  it('keeps no request-auth compatibility shim', () => {
    expect(
      files
        .filter(({ path }) => path.endsWith('/request-auth.server.ts'))
        .map(
          ({ path }) => `${path}: use request-context.server.ts; compatibility shims are forbidden`,
        ),
    ).toEqual([]);
  });

  it('resolves the tenant exactly once, in request-security.server.ts', () => {
    const failures: string[] = [];
    let callSites = 0;
    for (const { path, source } of files) {
      const calls = source.match(/\bresolveStorefront\s*\(/g) ?? [];
      if (path === requestSecurityServerPath) {
        callSites += calls.length;
      } else if (path !== tenantServerPath && calls.length > 0) {
        failures.push(
          `${path}: resolve storefront only in request-security.server.ts; use the request context`,
        );
      }
    }
    if (callSites !== 1) {
      failures.push(
        `${requestSecurityServerPath}: expected exactly one resolveStorefront() call, found ${callSites}`,
      );
    }
    expect(failures).toEqual([]);
  });

  it('never serialises a credential into a browser URL', () => {
    const failures: string[] = [];
    for (const { path, source } of files) {
      for (const form of source.matchAll(
        /<Form\b[^>]*method=["']get["'][^>]*>[\s\S]*?<\/Form>/gi,
      )) {
        if (/name=["'](otp|token|password|challengeId)["']/i.test(form[0])) {
          failures.push(`${path}: sensitive form field would be serialized into a browser URL`);
        }
      }
      if (/[?&](otp|token|password|challengeId)=/.test(source)) {
        failures.push(`${path}: sensitive credential encoded in a URL`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives every auth form a native POST fallback', () => {
    const failures: string[] = [];
    for (const { path, source } of files.filter(({ path }) => protectsAuthCredentials(path))) {
      for (const formTag of source.match(/<form\b[^>]*>/g) ?? []) {
        if (!/\bmethod=["']post["']/i.test(formTag)) {
          failures.push(`${path}: auth forms must declare a native POST fallback`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives the shared GenericForm a native POST fallback', () => {
    const source = readSource(repoPath(genericFormPath));
    expect(
      (source.match(/<form\b[^>]*>/g) ?? [])
        .filter((formTag) => !/\bmethod=["']post["']/i.test(formTag))
        .map(() => `${genericFormPath}: shared forms must declare a native POST fallback`),
    ).toEqual([]);
  });
});
