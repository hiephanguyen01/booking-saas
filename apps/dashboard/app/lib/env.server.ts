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

/**
 * Mirrors the storefront's `requiredHostname`
 * (`apps/storefront/app/lib/server/env.server.ts`, validating
 * `PLATFORM_BASE_DOMAIN`): missing fails loudly in production instead of the
 * `isPlatformHostname` silent fallback this replaces ("absent means no host is
 * the platform host"), and a malformed value — a URL, a host:port, a stray
 * path — is rejected outright rather than being compared verbatim against
 * every incoming Host header and simply never matching. Refusing to boot beats
 * serving a console that 404s for everyone with nothing in the logs naming
 * the cause.
 */
function requiredHostname(
  name: 'DASHBOARD_HOST',
  value: string | undefined,
  developmentFallback: string,
): string {
  if (!value && production) invalidEnvironment(`${name} is required in production`);
  const hostname = (value ?? developmentFallback).trim().toLowerCase().replace(/\.$/, '');

  let parsedHostname: URL;
  try {
    parsedHostname = new URL(`http://${hostname}`);
  } catch {
    invalidEnvironment(`${name} must be a valid hostname`);
  }
  if (
    parsedHostname.hostname !== hostname ||
    parsedHostname.port ||
    parsedHostname.username ||
    parsedHostname.password ||
    parsedHostname.pathname !== '/'
  ) {
    invalidEnvironment(`${name} must be a bare hostname`);
  }

  return hostname;
}

const dashboardHost = requiredHostname('DASHBOARD_HOST', process.env.DASHBOARD_HOST, 'localhost');

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
   * The platform console's own configured hostname
   * (`admin.stg.bookingos.vn`). `tenant-host.server.ts`'s
   * `isPlatformHostname` uses this as the primary way to recognize the
   * platform host — the "no dot" / bare-IP branches exist only to cover local
   * dev (`localhost`, a bare container IP) and never match a real deployed
   * hostname. `docker-compose.deploy.yml` sets this on the `dashboard`
   * service with the same value Caddy already reads to route `admin.*`
   * there, so the routing contract and the app's own idea of its host can
   * never disagree.
   */
  dashboardHost,
});
