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
import { NsI18n, useTranslation } from '~/lib/i18n';

export function HeaderActions({
  title,
  favorite,
}: {
  title: string;
  favorite: { kind: FavoriteTargetKind; id: string };
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const { copied, copyLink, reportOpen, setReportOpen } = useHeaderActionsController();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <FavoriteHeartButton
        kind={favorite.kind}
        id={favorite.id}
        title={title}
        className="size-11"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
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
