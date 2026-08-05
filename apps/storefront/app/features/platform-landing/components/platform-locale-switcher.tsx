import { Globe } from 'lucide-react';
import { Link } from 'react-router';
import { type Locale, NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { switchLocalePath } from '~/constants/paths';
import { useCurrentLocationPath } from '~/features/platform-landing/hooks/use-current-location-path';

/**
 * Language names are endonyms — a language is named in its own language, so these
 * are constants rather than translation keys. Translating them would offer
 * "Vietnamese" to a reader who cannot read the English page it sits on.
 */
const LOCALE_OPTIONS = [
  { value: 'vi', short: 'VI', label: 'Tiếng Việt' },
  { value: 'en', short: 'EN', label: 'English' },
] as const satisfies ReadonlyArray<{ value: Locale; short: string; label: string }>;

/**
 * The platform landing's language switcher.
 *
 * Both languages stay on screen with the active one marked, rather than a single
 * button showing the code of the language you are *not* in. Each option links to
 * the same page in that language — `switchLocalePath` swaps the locale segment
 * and carries the fragment, so switching from a section leaves you in it.
 *
 * The choice persists because the platform host's middleware writes `sf_locale`
 * whenever it serves `/vi` or `/en` (see `request-security.server.ts`). That host
 * answers GET and HEAD only, so there is deliberately no action to post to here.
 */
export function PlatformLocaleSwitcher({
  locale,
  className,
  onSwitch,
}: {
  locale: Locale;
  className?: string;
  onSwitch?: () => void;
}) {
  const { t } = useTranslation(NsI18n.Platform);
  const currentPath = useCurrentLocationPath();

  return (
    <nav
      aria-label={t('nav.language')}
      className={cn('platform-locale-switcher inline-flex', className)}
    >
      <Globe aria-hidden="true" className="ml-1.5 hidden size-4 shrink-0 xl:block" />
      {LOCALE_OPTIONS.map((option) => (
        <Link
          key={option.value}
          to={switchLocalePath(currentPath, option.value)}
          aria-current={option.value === locale ? 'true' : undefined}
          aria-label={option.label}
          className="platform-locale-option"
          onClick={onSwitch}
        >
          {option.short}
        </Link>
      ))}
    </nav>
  );
}
