import { ArrowUp, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import type { StorefrontTenant } from '../lib/tenant.server';
import { useT } from '../lib/i18n';

/** Storefront footer — brand, contact + social links from theme_config (§16.2). */
export function SiteFooter({ tenant }: { tenant: StorefrontTenant }) {
  const { t } = useT();
  const socials = [
    { href: tenant.social.facebook, label: 'Facebook' },
    { href: tenant.social.instagram, label: 'Instagram' },
    { href: tenant.social.tiktok, label: 'TikTok' },
    { href: tenant.social.youtube, label: 'YouTube' },
  ].filter((s) => s.href);

  const socialsRow =
    socials.length > 0 ? (
      <div className="flex flex-col items-center gap-3 sm:items-start">
        <span className="text-sm text-muted-foreground">{t('footer.followUs')}</span>
        <div className="flex items-center gap-3">
          {socials.map(({ href, label }) => (
            <a
              key={label}
              href={href!}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
            >
              <ExternalLink className="size-4" />
              {label}
            </a>
          ))}
        </div>
      </div>
    ) : null;

  // Static link labels below have no real destination today — rendered as
  // non-interactive text rather than dead `href="#"` anchors.
  const aboutList = (
    <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
      <span className="font-semibold text-foreground">{t('footer.aboutUs')}</span>
      <span className="text-sm text-muted-foreground">{t('footer.aboutLinks.intro', { tenant: tenant.name })}</span>
      <span className="text-sm text-muted-foreground">{t('footer.aboutLinks.privacy')}</span>
      <span className="text-sm text-muted-foreground">{t('footer.aboutLinks.terms')}</span>
    </div>
  );

  const supportList = (
    <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
      <span className="font-semibold text-foreground">{t('footer.support')}</span>
      <span className="text-sm text-muted-foreground">{t('footer.supportLinks.help')}</span>
      <span className="text-sm text-muted-foreground">{t('footer.supportLinks.rules')}</span>
      {tenant.contact.phone ? (
        <span className="text-sm text-muted-foreground">{tenant.contact.phone}</span>
      ) : (
        <span className="text-sm text-muted-foreground">{t('footer.supportLinks.contact')}</span>
      )}
    </div>
  );

  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border">
      {/* Desktop: 4-column grid */}
      <div className="mx-auto hidden max-w-7xl grid-cols-4 gap-8 px-6 py-10 sm:grid">
        {socialsRow}
        {aboutList}
        {supportList}
        <div className="flex flex-col gap-3">
          <Link to="/" className="text-lg font-extrabold text-primary">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-auto max-w-40 object-contain" />
            ) : (
              tenant.name
            )}
          </Link>
          <span className="font-semibold text-foreground">{tenant.name}</span>
          <span className="text-sm text-muted-foreground">{t('common.currencyNote')}</span>
          {tenant.contact.address ? (
            <span className="text-sm text-muted-foreground">{tenant.contact.address}</span>
          ) : null}
          <Link
            to="/become-partner"
            className="text-sm font-medium text-foreground transition-colors hover:text-primary"
          >
            {t('becomePartner.title')}
          </Link>
        </div>
      </div>
      <div className="mx-auto hidden max-w-7xl items-center justify-between border-t border-border px-6 py-4 sm:flex">
        <span className="text-sm text-muted-foreground">{t('footer.copyright', { year, tenant: tenant.name })}</span>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={t('footer.scrollToTop')}
          className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>

      {/* Mobile: single centered column */}
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-6 py-8 text-center sm:hidden">
        <Link to="/" className="text-lg font-extrabold text-primary">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-auto max-w-40 object-contain" />
          ) : (
            tenant.name
          )}
        </Link>
        {aboutList}
        {supportList}
        {socialsRow}
      </div>
    </footer>
  );
}
