import { Link } from 'react-router';
import { NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import type { StorefrontTenant } from '../lib/tenant.server';
import { useLocale } from '../lib/use-locale';
import { SOCIAL_PROFILES } from './site-footer-fallback';
import { TenantBrand } from './tenant-brand';

export function SiteFooter({
  tenant,
  className = 'mt-16',
}: {
  tenant: StorefrontTenant;
  className?: string;
}) {
  const { t } = useTranslation([NsI18n.Common, NsI18n.Navigation]);
  const locale = useLocale();

  const socials = SOCIAL_PROFILES.flatMap((social) => {
    const href = tenant.social[social.tenantKey];
    return href ? [{ ...social, href }] : [];
  });

  return (
    <footer className={`${className} bg-background pb-6 font-studio text-foreground`}>
      <div className="mx-auto w-full max-w-292.5 px-4 pt-8 sm:px-6 xl:pb-0 xl:pt-10 xl:px-0">
        <div className="grid gap-10 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="footer-brand" className="flex flex-col items-start gap-4">
            <h2 id="footer-brand" className="sr-only">
              {tenant.name}
            </h2>
            <Link
              to={storefrontPaths.home(locale)}
              prefetch="intent"
              aria-label={t('navigation:brandHome', { tenant: tenant.name })}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TenantBrand
                name={tenant.name}
                logoUrl={tenant.logoUrl}
                imageClassName="h-12 w-auto max-w-48 object-contain"
                textClassName="max-w-64 text-xl font-bold text-primary"
              />
            </Link>
            {tenant.contact.address ? (
              <p className="max-w-80 text-sm leading-5 text-muted-foreground">
                {tenant.contact.address}
              </p>
            ) : null}
            {socials.length ? (
              <>
                <p className="text-sm leading-5 text-muted-foreground">{t('footer.followUs')}</p>
                <div className="flex items-center gap-3">
                  {socials.map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={social.name}
                      className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <img src={social.src} alt="" width={40} height={40} className="size-10" />
                    </a>
                  ))}
                </div>
              </>
            ) : null}
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
        </div>

        <div className="mt-10 flex min-h-14 items-end justify-center border-t border-border pt-5 xl:min-h-[70px]">
          <p className="text-center text-sm leading-5 text-muted-foreground">
            {t('footer.copyright')}
          </p>
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
