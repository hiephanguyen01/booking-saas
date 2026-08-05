import type { PlatformRootLoaderPayload } from '~/features/root/server/root-loader.server';
import { NsI18n, useTranslation } from '@booking/i18n';
import { PlatformBrand } from '~/features/platform-landing/components/platform-header';
import { PlatformLocaleSwitcher } from '~/features/platform-landing/components/platform-locale-switcher';

export function PlatformFooter({ loaderData }: { loaderData: PlatformRootLoaderPayload }) {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <footer className="border-t border-border bg-secondary px-5 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto grid w-full max-w-300 gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <PlatformBrand label={t('brandLabel')} />
          <p className="mt-4 max-w-95 text-[15px] leading-6 text-(--platform-muted-soft)">
            {t('footer.tagline')}
          </p>
          <div className="mt-5">
            <PlatformLocaleSwitcher locale={loaderData.locale} />
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
          <h2 className="text-[13px] font-bold tracking-[0.05em] text-(--platform-muted-subtle) uppercase">
            {t('footer.legalTitle')}
          </h2>
          <ul className="mt-4 grid gap-3 text-[15px] text-(--platform-muted-subtle)">
            <li title={t('footer.legalUnavailable')}>{t('footer.terms')}</li>
            <li title={t('footer.legalUnavailable')}>{t('footer.privacy')}</li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-10 w-full max-w-300 border-t border-border pt-6 text-sm text-(--platform-muted-subtle)">
        <p>© {t('footer.rights')}</p>
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-[13px] font-bold tracking-[0.05em] text-(--platform-muted-subtle) uppercase">
        {title}
      </h2>
      <ul className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <li key={`${label}-${href}`}>
            <a
              href={href}
              className="text-[15px] text-muted-foreground transition hover:text-(--platform-primary-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
