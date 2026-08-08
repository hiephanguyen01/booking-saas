import type { FavoriteTargetKind } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@booking/ui/components/ui/dropdown-menu';
import { Copy, EllipsisVertical, Flag } from 'lucide-react';
import { ContentReportDialog } from '~/features/content-reports/components/content-report-dialog';
import { FavoriteHeartButton } from '~/features/favorites/components/favorite-heart-button';
import { useHeaderActionsController } from '~/hooks/use-header-actions-controller';
import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';

export function HeaderActions({
  title,
  favorite,
  inverted = false,
}: {
  title: string;
  favorite: { kind: FavoriteTargetKind; id: string };
  inverted?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const { copied, copyLink, reportOpen, setReportOpen } = useHeaderActionsController();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <FavoriteHeartButton
        kind={favorite.kind}
        id={favorite.id}
        title={title}
        className={cn(
          'size-11',
          inverted && 'text-background hover:bg-background/10 hover:text-background',
        )}
        iconClassName={inverted ? 'text-background' : undefined}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'size-11',
              inverted && 'text-background hover:bg-background/10 hover:text-background',
            )}
            aria-label={t('group.moreOptions')}
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => void copyLink()}>
              <Copy /> {copied ? t('group.linkCopied') : t('group.copyLink')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setReportOpen(true)}
            >
              <Flag /> {t('report.menu')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ContentReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        target={favorite.kind}
        targetId={favorite.id}
        title={title}
      />
    </div>
  );
}
