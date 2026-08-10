import type { FavoriteTargetKind } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { HeaderActions } from '~/components/header-actions';
import { TenantInstallTrigger } from '~/features/pwa/components/tenant-install-trigger';

export function MobileDetailHeader({
  backHref,
  title,
  favorite,
}: {
  backHref: string;
  title: string;
  favorite: { kind: FavoriteTargetKind; id: string };
}) {
  const { t } = useTranslation(NsI18n.Common);

  return (
    <header className="sticky top-0 z-40 flex min-h-15 items-center gap-2 bg-foreground px-3 pt-[env(safe-area-inset-top)] text-background shadow-lg">
      <Button
        asChild
        size="icon"
        variant="ghost"
        className="shrink-0 rounded-full text-background hover:bg-background/10 hover:text-background"
      >
        <Link to={backHref} aria-label={t('back')}>
          <ArrowLeft />
        </Link>
      </Button>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
      <TenantInstallTrigger
        variant="compact"
        className="bg-background text-foreground hover:bg-background/90"
      />
      <HeaderActions title={title} favorite={favorite} inverted />
    </header>
  );
}
