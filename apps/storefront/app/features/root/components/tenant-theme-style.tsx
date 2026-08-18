import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { themeCss } from '~/lib/theme';

/**
 * Per-tenant brand tokens, injected once at SSR so every UI component re-tints.
 *
 * `suppressHydrationWarning` is for the **nonce, not the CSS**. Once a browser has
 * applied the CSP it blanks the `nonce` *content attribute* in the DOM — deliberate,
 * per the HTML spec, so a `[nonce="…"]` CSS selector cannot exfiltrate it — while
 * keeping the value on the IDL property. React hydration compares the content
 * attribute, reads `""` against the real nonce in props, and reports a mismatch it
 * says it "won't patch up", on every page load forever. Suppressing it here is safe
 * because the CSS itself cannot legitimately differ: both sides derive it from the
 * same `themeConfig` in root loader data.
 */
export function TenantThemeStyle({
  theme,
  nonce,
}: {
  theme: StorefrontTenant['themeConfig'];
  nonce: string;
}) {
  return (
    <style
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeCss(theme) }}
    />
  );
}
