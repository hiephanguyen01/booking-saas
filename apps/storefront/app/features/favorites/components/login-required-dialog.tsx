import type { Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Heart } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';

/** Shown when a logged-out visitor clicks a heart. Login returns to the current page. */
export function LoginRequiredDialog({
  open,
  onOpenChange,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const location = useLocation();
  const redirectTo = `${location.pathname}${location.search}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Heart aria-hidden="true" className="size-6" />
          </span>
          <DialogTitle className="text-center">{t('favorites.loginRequiredTitle')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('favorites.loginRequiredBody')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-col sm:gap-2">
          <Button asChild className="w-full">
            <Link to={storefrontPaths.login(locale, redirectTo)}>{t('favorites.loginCta')}</Link>
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            {t('favorites.loginLater')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
