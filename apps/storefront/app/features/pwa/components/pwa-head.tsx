import { pwaBrand, type PwaTenantBrandInput } from '~/features/pwa/lib/manifest';

export function PwaHead({ tenant }: { tenant: PwaTenantBrandInput | null }) {
  const { shortName, themeColor, appleTouchIconUrl } = pwaBrand(tenant);
  return (
    <>
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="apple-touch-icon" href={appleTouchIconUrl} />
      <meta name="theme-color" content={themeColor} />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content={shortName} />
      <meta name="application-name" content={shortName} />
    </>
  );
}
