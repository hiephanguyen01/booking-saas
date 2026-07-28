import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { themeCss } from '~/lib/theme';

/** Per-tenant brand tokens, injected once at SSR so every UI component re-tints. */
export function TenantThemeStyle({
  theme,
  nonce,
}: {
  theme: StorefrontTenant['themeConfig'];
  nonce: string;
}) {
  return <style nonce={nonce} dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />;
}
