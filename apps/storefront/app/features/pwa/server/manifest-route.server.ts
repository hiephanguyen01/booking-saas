import { buildWebAppManifest } from '~/features/pwa/lib/manifest';
import { resolveLocale } from '~/lib/server/i18n.server';
import { getOptionalStorefrontTenant } from '~/lib/server/request-context.server';

export function buildManifestResponse(request: Request): Response {
  const tenant = getOptionalStorefrontTenant();
  const locale = resolveLocale(request, tenant?.defaultLocale ?? 'vi');

  const manifest = buildWebAppManifest({
    tenant: tenant ? { name: tenant.name, themeConfig: tenant.themeConfig } : null,
    locale,
  });

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
}
