import { Link } from 'react-router';
import { NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import type { StorefrontTenant } from '../lib/tenant.server';
import { useLocale } from '../lib/use-locale';
import { SITE_FOOTER_FALLBACK } from './site-footer-fallback';
import { TenantBrand } from './tenant-brand';

export function SiteFooter({
  tenant,
  className = 'mt-16',
}: {
  tenant: StorefrontTenant;
  className?: string;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const locale = useLocale();

  return (
    <footer className={`${className} bg-background font-studio text-foreground`}>
      <div className="mx-auto w-full max-w-292.5 px-4 pb-6 pt-8 sm:px-6 lg:pb-0 lg:pt-10 xl:px-0">
        <div className="grid gap-10 sm:grid-cols-2 lg:min-h-[180px] lg:grid-cols-[370px_220px_220px_270px] lg:justify-between lg:gap-0">
          <section aria-labelledby="footer-download" className="flex flex-col items-start">
            <h2 id="footer-download" className="text-base font-semibold leading-6">
              {t('footer.downloadApp')}
            </h2>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {SITE_FOOTER_FALLBACK.appBadges.map((badge) => (
                <img
                  key={badge.name}
                  src={badge.src}
                  alt={badge.alt}
                  width={badge.width}
                  height={badge.height}
                  className="h-11 w-auto"
                />
              ))}
            </div>
            <p className="mt-4 text-sm leading-5 text-muted-foreground">
              {t('footer.followUs')}
            </p>
            <div className="mt-3 flex items-center gap-3">
              {SITE_FOOTER_FALLBACK.socialProfiles.map((social) => {
                const href = social.tenantKey ? tenant.social[social.tenantKey] : null;
                const icon = (
                  <img
                    src={social.src}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10"
                  />
                );
                return href ? (
                  <a
                    key={social.name}
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={social.name}
                    className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {icon}
                  </a>
                ) : (
                  <span key={social.name} role="img" aria-label={social.name}>
                    {icon}
                  </span>
                );
              })}
            </div>
          </section>

          <FooterList
            title={t('footer.aboutUs')}
            items={[
              t('footer.aboutLinks.intro', { tenant: tenant.name }),
              t('footer.aboutLinks.privacy'),
              t('footer.aboutLinks.terms'),
            ]}
          />
          <FooterList
            title={t('footer.support')}
            items={[
              t('footer.supportLinks.help'),
              t('footer.supportLinks.rules'),
              tenant.contact.phone ?? tenant.contact.email ?? t('footer.supportLinks.contact'),
            ]}
          />

          <section aria-labelledby="footer-company" className="flex flex-col items-start gap-4">
            <Link
              to={storefrontPaths.home(locale)}
              prefetch="intent"
              aria-label={`${tenant.name} - Trang chủ`}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TenantBrand
                name={tenant.name}
                logoUrl={tenant.logoUrl}
                imageClassName="h-12 w-auto max-w-48 object-contain"
                textClassName="max-w-64 text-xl font-bold text-primary"
              />
            </Link>
            <h2 id="footer-company" className="text-base font-semibold leading-6">
              {t('footer.companyName')}
            </h2>
            <img
              src={SITE_FOOTER_FALLBACK.legalBadge.src}
              alt={SITE_FOOTER_FALLBACK.legalBadge.alt}
              width={SITE_FOOTER_FALLBACK.legalBadge.width}
              height={SITE_FOOTER_FALLBACK.legalBadge.height}
              className="h-10 w-32.5 object-contain"
            />
          </section>
        </div>

        <div className="relative mt-10 flex min-h-14 items-end justify-center border-t border-border pt-5 lg:min-h-[70px]">
          <p className="pr-14 text-center text-sm leading-5 text-muted-foreground sm:pr-0">
            {t('footer.copyright')}
          </p>
          {/* <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label={t('footer.scrollToTop')}
            className="absolute -top-10 right-0 flex size-17 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUp aria-hidden="true" className="size-8" strokeWidth={1.7} />
          </button> */}
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="flex flex-col items-start gap-3">
      <h2 className="text-base font-semibold uppercase leading-6">{title}</h2>
      {items.map((item) => (
        <span key={item} className="text-sm font-medium leading-5 text-muted-foreground">
          {item}
        </span>
      ))}
    </section>
  );
}
