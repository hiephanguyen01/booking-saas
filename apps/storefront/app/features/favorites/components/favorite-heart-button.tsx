import type { FavoriteTargetKind } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Heart } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { useFavorite } from '~/features/favorites/hooks/use-favorite';
import { cn } from '@booking/ui/lib/utils';

/** Standalone favorite heart for detail pages (listing + group headers). */
export function FavoriteHeartButton({
  kind,
  id,
  title,
  className,
  iconClassName,
}: {
  kind: FavoriteTargetKind;
  id: string;
  title: string;
  className?: string;
  iconClassName?: string;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { selected, toggle } = useFavorite(kind, id);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-pressed={selected}
      aria-label={t(selected ? 'favorites.remove' : 'favorites.add', { title })}
      onClick={toggle}
    >
      <Heart
        className={cn('text-primary', iconClassName)}
        fill={selected ? 'currentColor' : 'none'}
      />
    </Button>
  );
}
