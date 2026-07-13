import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import type { StorefrontTenant } from '../lib/tenant.server';
import { useT } from '../lib/i18n';

/** Storefront footer — brand line, contact + social links from theme_config (§16.2). */
export function SiteFooter({ tenant }: { tenant: StorefrontTenant }) {
  const { t } = useT();
  const socials = [
    { href: tenant.social.facebook, label: 'Facebook' },
    { href: tenant.social.instagram, label: 'Instagram' },
    { href: tenant.social.tiktok, label: 'TikTok' },
    { href: tenant.social.youtube, label: 'YouTube' },
  ].filter((s) => s.href);

  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <span className="block font-semibold text-foreground">{tenant.name}</span>
          <span className="block">{t('common.currencyNote')}</span>
          {tenant.contact.phone ? <span className="block">{tenant.contact.phone}</span> : null}
          {tenant.contact.address ? <span className="block">{tenant.contact.address}</span> : null}
          <Link
            to="/become-partner"
            className="inline-block pt-1 font-medium text-foreground transition-colors hover:text-primary"
          >
            {t('becomePartner.title')}
          </Link>
        </div>
        {socials.length > 0 ? (
          <div className="flex items-center gap-3">
            <span className="sr-only">{t('footer.followUs')}</span>
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
        ) : null}
      </div>
    </footer>
  );
}
