import type { Locale } from '@booking/i18n';
import { Links, Meta, Scripts, ScrollRestoration } from 'react-router';

export function StorefrontDocument({
  children,
  locale,
  faviconUrl,
}: {
  children: React.ReactNode;
  locale: Locale;
  faviconUrl: string | null;
}) {
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {faviconUrl ? <link rel="icon" href={faviconUrl} /> : null}
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
