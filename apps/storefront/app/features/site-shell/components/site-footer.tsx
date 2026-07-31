import { Link } from 'react-router';
import { Mail, Phone } from 'lucide-react';
import {
  siFacebook,
  siInstagram,
  siTiktok,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { useLocale } from '~/hooks/use-locale';
import { LEGAL_DOCUMENT_LABELS } from '~/features/legal/lib/legal-copy';
import { SOCIAL_PROFILES, type SocialKey } from '~/features/site-shell/lib/site-footer-fallback';
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
  const config = tenant.themeConfig;
  const contact = config.contact;

  const socials = SOCIAL_PROFILES.flatMap((social) => {
    const href = config.socialLinks?.[social.tenantKey];
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
                logoUrl={config.logoUrl || null}
                imageClassName="h-12 w-auto max-w-48 object-contain"
                textClassName="max-w-64 text-xl font-bold text-primary"
              />
            </Link>
            {contact?.address ? (
              <p className="max-w-80 text-sm leading-5 text-muted-foreground">{contact.address}</p>
            ) : null}
            {contact?.phone || contact?.email ? (
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="inline-flex items-center gap-2 hover:text-primary"
                  >
                    <Phone aria-hidden="true" className="size-4" />
                    {contact.phone}
                  </a>
                ) : null}
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-flex items-center gap-2 hover:text-primary"
                  >
                    <Mail aria-hidden="true" className="size-4" />
                    {contact.email}
                  </a>
                ) : null}
              </div>
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
                      className="rounded-full text-foreground transition-colors hover:text-(--sf-accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <SocialIcon network={social.tenantKey} />
                    </a>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <FooterList
            title={t('footer.aboutUs')}
            items={[
              { label: t('footer.aboutLinks.intro', { tenant: tenant.name }) },
              { label: t('footer.aboutLinks.privacy'), href: storefrontPaths.legal(locale, 'privacy_policy') },
              { label: t('footer.aboutLinks.terms'), href: storefrontPaths.legal(locale, 'customer_terms') },
            ]}
          />
          <FooterList
            title={t('footer.support')}
            items={[
              { label: t('footer.supportLinks.help') },
              { label: t('footer.supportLinks.rules') },
              ...(!contact?.phone && !contact?.email ? [{ label: t('footer.supportLinks.contact') }] : []),
              {
                label: LEGAL_DOCUMENT_LABELS.partner_terms[locale],
                href: storefrontPaths.legal(locale, 'partner_terms'),
              },
              {
                label: LEGAL_DOCUMENT_LABELS.affiliate_terms[locale],
                href: storefrontPaths.legal(locale, 'affiliate_terms'),
              },
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

const SOCIAL_ICONS: Record<SocialKey, SimpleIcon> = {
  facebook: siFacebook,
  instagram: siInstagram,
  tiktok: siTiktok,
  youtube: siYoutube,
};

function SocialIcon({ network }: { network: SocialKey }) {
  const icon = SOCIAL_ICONS[network];

  return (
    <svg
      aria-hidden="true"
      className="size-6"
      fill={`#${icon.hex}`}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} />
    </svg>
  );
}

function FooterList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <section className="flex flex-col items-start gap-3">
      <h2 className="text-base font-semibold uppercase leading-6">{title}</h2>
      {items.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            to={item.href}
            className="text-sm font-medium leading-5 text-muted-foreground hover:text-primary"
          >
            {item.label}
          </Link>
        ) : (
          <span key={item.label} className="text-sm font-medium leading-5 text-muted-foreground">
            {item.label}
          </span>
        ),
      )}
    </section>
  );
}
