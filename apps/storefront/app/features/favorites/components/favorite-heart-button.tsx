import type { FavoriteTargetKind } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Heart } from 'lucide-react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useFavorite } from '~/features/favorites/hooks/use-favorite';

/** Standalone favorite heart for detail pages (listing + group headers). */
export function FavoriteHeartButton({
  kind,
  id,
  title,
  className,
}: {
  kind: FavoriteTargetKind;
  id: string;
  title: string;
  className?: string;
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
      <Heart className="text-primary" fill={selected ? 'currentColor' : 'none'} />
    </Button>
  );
}
