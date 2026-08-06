import type { Locale } from '@booking/i18n';
import { Links, Meta, Scripts, ScrollRestoration } from 'react-router';
import { PwaHead } from '~/features/pwa/components/pwa-head';
import type { PwaTenantBrandInput } from '~/features/pwa/lib/manifest';

export function StorefrontDocument({
  children,
  locale,
  faviconUrl,
  pwaTenant,
}: {
  children: React.ReactNode;
  locale: Locale;
  faviconUrl: string | null;
  pwaTenant: PwaTenantBrandInput | null;
}) {
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {faviconUrl ? <link rel="icon" href={faviconUrl} /> : null}
        <PwaHead tenant={pwaTenant} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
