import type { FavoriteTargetKind } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@booking/ui/components/ui/dropdown-menu';
import { Copy, EllipsisVertical } from 'lucide-react';
import { useState } from 'react';
import { FavoriteHeartButton } from '../../favorites/components/favorite-heart-button';
import { NsI18n, useTranslation } from '../../../lib/i18n';

const COPIED_FEEDBACK_MS = 1800;

export function HeaderActions({
  title,
  favorite,
}: {
  title: string;
  favorite: { kind: FavoriteTargetKind; id: string };
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const [copied, setCopied] = useState(false);

  async function copyLink(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        copyTextFallback(window.location.href);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setCopied(copyTextFallback(window.location.href));
    }
  }

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
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function copyTextFallback(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}
