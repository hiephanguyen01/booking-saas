import type { PlatformRootLoaderPayload } from '~/features/root/server/root-loader.server';
import { NsI18n, useTranslation } from '@booking/i18n';
import { PlatformBrand } from '~/features/platform-landing/components/platform-header';

export function PlatformFooter({ loaderData }: { loaderData: PlatformRootLoaderPayload }) {
  const { t } = useTranslation(NsI18n.Platform);
  const alternateLocale = loaderData.locale === 'vi' ? 'en' : 'vi';

  return (
    <footer className="border-t border-[#e4e6ea] bg-[#fbfbfc] px-5 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto grid w-full max-w-300 gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <PlatformBrand label={t('brandLabel')} />
          <p className="mt-4 max-w-95 text-[15px] leading-6 text-[#6a707a]">
            {t('footer.tagline')}
          </p>
          <div className="mt-5 flex gap-2">
            <span className="rounded-full bg-[#0a0e13] px-3 py-1.5 text-sm font-semibold text-white">
              {loaderData.locale === 'vi' ? 'Tiếng Việt' : 'English'}
            </span>
            <a
              href={`/${alternateLocale}`}
              className="rounded-full border border-[#d3d6dc] px-3 py-1.5 text-sm font-semibold text-[#4a515b] hover:border-[#0a0e13] hover:text-[#0a0e13]"
            >
              {alternateLocale === 'vi' ? 'Tiếng Việt' : 'English'}
            </a>
          </div>
        </div>
        <FooterGroup
          title={t('footer.productTitle')}
          links={[
            [t('footer.product'), '#capabilities'],
            [t('nav.solutions'), '#models'],
            [t('footer.workflow'), '#workflow'],
            [t('footer.pricing'), '#pricing'],
            [t('footer.faq'), '#faq'],
            [t('footer.login'), loaderData.dashboardLoginUrl],
          ]}
        />
        <nav aria-label={t('footer.legalTitle')}>
          <h2 className="text-[13px] font-bold tracking-[0.05em] text-[#8a909a] uppercase">
            {t('footer.legalTitle')}
          </h2>
          <ul className="mt-4 grid gap-3 text-[15px] text-[#9aa0a9]">
            <li title={t('footer.legalUnavailable')}>{t('footer.terms')}</li>
            <li title={t('footer.legalUnavailable')}>{t('footer.privacy')}</li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-10 w-full max-w-300 border-t border-[#e4e6ea] pt-6 text-sm text-[#8a909a]">
        <p>© {t('footer.rights')}</p>
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-[13px] font-bold tracking-[0.05em] text-[#8a909a] uppercase">{title}</h2>
      <ul className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <li key={`${label}-${href}`}>
            <a
              href={href}
              className="text-[15px] text-[#4a515b] transition hover:text-[#b27400] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b87300]"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
