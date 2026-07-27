import { Button } from '@booking/ui/components/ui/button';
import { Camera, Sparkles, UsersRound } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import type { StorefrontContext } from '../root';
import { NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';

export function meta() {
  return [{ title: 'Community | BookingOS' }];
}
export default function CommunityPage() {
  const { locale, currentUser } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="relative isolate overflow-hidden bg-muted/30 px-4 py-20 font-studio sm:px-6 lg:py-28">
      <div className="absolute left-1/2 top-8 -z-10 size-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-semibold tracking-[0.28em] text-primary">
          {t('community.eyebrow')}
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          {t('community.title')}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {t('community.description')}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to={storefrontPaths.home(locale)}>{t('community.backHome')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link
              to={
                currentUser
                  ? storefrontPaths.account.profile(locale)
                  : storefrontPaths.login(locale, storefrontPaths.account.profile(locale))
              }
            >
              {t('community.account')}
            </Link>
          </Button>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[Camera, UsersRound, Sparkles].map((Icon, index) => (
            <div
              key={index}
              className="flex min-h-36 items-center justify-center rounded-2xl border border-border bg-background/80 shadow-sm backdrop-blur"
            >
              <Icon className="size-8 text-primary" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
