import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { PlatformLocaleSwitcher } from './platform-locale-switcher';

const NAV_ITEMS = [
  { href: '#capabilities', label: 'nav.product' },
  { href: '#models', label: 'nav.solutions' },
  { href: '#workflow', label: 'nav.workflow' },
  { href: '#pricing', label: 'nav.pricing' },
  { href: '#faq', label: 'nav.faq' },
] as const;

export function PlatformHeader({
  locale,
  dashboardLoginUrl,
}: {
  locale: 'vi' | 'en';
  dashboardLoginUrl: string;
}) {
  const { t } = useTranslation(NsI18n.Platform);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="platform-header sticky top-0 z-40 border-b border-border bg-background/86 backdrop-blur-xl">
      <div className="mx-auto flex h-18 w-full max-w-300 items-center gap-7 px-5 sm:px-6">
        <PlatformBrand label={t('brandLabel')} />

        <nav aria-label={t('nav.label')} className="ml-2 hidden items-center gap-6 xl:flex">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} className="platform-nav-link" href={item.href}>
              {t(item.label)}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {/* From `sm:`, where it used to appear only from `xl:` — on every
              tablet and most laptops the only way to change language was to open
              the hamburger. Below 640px the brand, this group and the menu
              button no longer fit on one row, so that width keeps it in the
              sheet instead; no viewport shows both copies. */}
          <PlatformLocaleSwitcher locale={locale} className="hidden sm:inline-flex" />
          <a
            href={dashboardLoginUrl}
            className="hidden min-h-11 items-center justify-center text-[15px] font-semibold text-(--platform-ink-soft) transition hover:text-(--platform-primary-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xl:inline-flex"
          >
            {t('nav.login')}
          </a>
          <a href="#consultation" className="platform-header-cta hidden xl:inline-flex">
            {t('nav.consultation')}
          </a>
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="platform-mobile-menu"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            className="platform-menu-button grid xl:hidden"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="platform-mobile-menu"
          className="platform-sheet-shadow border-t border-border bg-background px-5 pb-6 pt-4 sm:px-6 xl:hidden"
        >
          <nav aria-label={t('nav.label')} className="mx-auto grid w-full max-w-300 gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-12 items-center rounded-xl px-3 text-base font-semibold text-(--platform-ink-soft) hover:bg-primary/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={closeMenu}
              >
                {t(item.label)}
              </a>
            ))}
            <div className="mt-3 grid gap-3 border-t border-foreground/8 pt-4">
              {/* Labelled row rather than a third button cell: a segmented pair
                  and two full-width buttons are different shapes, and lining
                  them up stretched the pair into something that read as a
                  button too. Hidden from `sm:`, where the header carries it. */}
              <div className="flex items-center justify-between gap-3 sm:hidden">
                <span className="text-[15px] font-semibold text-(--platform-ink-soft)">
                  {t('nav.language')}
                </span>
                <PlatformLocaleSwitcher locale={locale} onSwitch={closeMenu} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <a
                  href={dashboardLoginUrl}
                  className="platform-secondary-button"
                  onClick={closeMenu}
                >
                  {t('nav.login')}
                </a>
                <a href="#consultation" className="platform-primary-button" onClick={closeMenu}>
                  {t('nav.consultation')}
                </a>
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function PlatformBrand({ label }: { label: string }) {
  return (
    <Link
      to="."
      aria-label={label}
      className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        className="grid size-7.5 place-items-center rounded-[0.56rem] bg-foreground"
        aria-hidden="true"
      >
        <span className="size-3 rounded-sm bg-primary" />
      </span>
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-foreground">
        BookingOS
      </span>
    </Link>
  );
}
