const production = process.env.NODE_ENV === 'production';

function invalidEnvironment(message: string): never {
  throw new Error(`Invalid Dashboard environment: ${message}`);
}

/**
 * Mirrors the storefront's `requiredUrl`
 * (`apps/storefront/app/lib/server/env.server.ts`): a missing value fails loudly
 * in production instead of quietly falling back to a dev default, and a
 * loopback host is rejected outright once in production. That silent `??`
 * fallback is exactly what let the "Đổi workspace" link ship pointing at a
 * caller's own laptop — `docker-compose.deploy.yml` never set `DASHBOARD_URL`
 * on the dashboard service, so it always fell through to `localhost:5174`.
 */
function requiredUrl(
  name: string,
  value: string | undefined,
  developmentFallback: string,
  protocols: readonly string[],
): URL {
  if (!value && production) invalidEnvironment(`${name} is required in production`);
  const url = new URL(value ?? developmentFallback);
  if (!protocols.includes(url.protocol)) {
    invalidEnvironment(
      `${name} must use ${protocols.map((item) => item.replace(':', '')).join(' or ')}`,
    );
  }
  if (production && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    invalidEnvironment(`${name} cannot target a loopback host in production`);
  }
  return url;
}

const dashboardUrl = requiredUrl('DASHBOARD_URL', process.env.DASHBOARD_URL, 'http://localhost:5174', [
  'http:',
  'https:',
]);

export const dashboardEnv = Object.freeze({
  production,
  /**
   * This console's own origin. Cross-host links — today just the "Đổi
   * workspace" switcher and the workspaces directory's per-tenant cards —
   * resolve against it rather than a relative path, since `/workspaces` and a
   * tenant's own console live on different hosts.
   */
  dashboardUrl: dashboardUrl.origin,
  /**
   * The platform console's own configured hostname. Still read here without a
   * production requirement — `tenant-host.server.ts`'s `isPlatformHostname`
   * only *adds* this as one more way to recognize the platform host (on top of
   * "no dot" / "bare IP", which cover local dev); Task 10 is what makes this
   * required and wires it into the deploy compose file. Centralized here now so
   * that task finds one place to add it rather than a second `process.env` read.
   */
  dashboardHost: process.env.DASHBOARD_HOST?.trim().toLowerCase() || undefined,
});
