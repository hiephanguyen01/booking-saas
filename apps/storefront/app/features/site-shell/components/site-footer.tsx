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
import { cn } from '@booking/ui/lib/utils';
import { storefrontPaths } from '~/constants/paths';
import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { useLocale } from '~/hooks/use-locale';
import { SOCIAL_PROFILES, type SocialKey } from '~/features/site-shell/lib/site-footer-fallback';
import { TenantBrand } from './tenant-brand';

export function SiteFooter({
  tenant,
  className = 'mt-16',
}: {
  tenant: StorefrontTenant;
  className?: string;
}) {
  const { t } = useTranslation([NsI18n.Common, NsI18n.Navigation, NsI18n.Legal]);
  const locale = useLocale();
  const config = tenant.themeConfig;
  const contact = config.contact;

  const socials = SOCIAL_PROFILES.flatMap((social) => {
    const href = config.socialLinks?.[social.tenantKey];
    return href ? [{ ...social, href }] : [];
  });

  return (
    <footer
      className={cn(
        // Temporarily off on phones and tablets: below `lg` the bottom tab bar
        // is the navigation, and a four-column sitemap under it is a second one
        // nobody scrolls to. `lg` — not `md` — because that is exactly where
        // `SiteBottomNav` hands navigation back to the header.
        'max-lg:hidden',
        className,
        'bg-background pb-6 font-studio text-foreground',
      )}
    >
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
              <div className="flex flex-col text-sm text-muted-foreground">
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="inline-flex min-h-11 items-center gap-2 hover:text-primary"
                  >
                    <Phone aria-hidden="true" className="size-4 shrink-0" />
                    {contact.phone}
                  </a>
                ) : null}
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-flex min-h-11 items-center gap-2 break-all hover:text-primary"
                  >
                    <Mail aria-hidden="true" className="size-4 shrink-0" />
                    {contact.email}
                  </a>
                ) : null}
              </div>
            ) : null}
            {socials.length ? (
              <>
                <p className="text-sm leading-5 text-muted-foreground">{t('footer.followUs')}</p>
                {/* `-mx-2.5` keeps the row optically flush with the column above
                    while each icon carries a 44px tap area around it. */}
                <div className="-mx-2.5 flex items-center">
                  {socials.map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={social.name}
                      className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:text-(--sf-accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                label: t('legal:documentLabels.partner_terms'),
                href: storefrontPaths.legal(locale, 'partner_terms'),
              },
              {
                label: t('legal:documentLabels.affiliate_terms'),
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
    // Links get `min-h-11` rather than the plain 20px line box they had, so a
    // thumb has something to hit; the static labels keep the tighter rhythm.
    <section className="flex flex-col items-start gap-1">
      <h2 className="mb-1 text-base font-semibold uppercase leading-6">{title}</h2>
      {items.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            to={item.href}
            className="flex min-h-11 items-center text-sm font-medium leading-5 text-muted-foreground hover:text-primary"
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.label}
            className="flex min-h-11 items-center text-sm font-medium leading-5 text-muted-foreground"
          >
            {item.label}
          </span>
        ),
      )}
    </section>
  );
}
