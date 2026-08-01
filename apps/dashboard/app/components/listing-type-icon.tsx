import * as Icons from 'lucide-react';
import { Image } from '@booking/ui/components/media/image';
import { cn } from '@booking/ui/lib/utils';

/**
 * Renders a listing type's icon. Prefers `imageUrl` — an uploaded icon image
 * (presign publicUrl) — and falls back to `name`, a lucide icon NAME from the
 * `LISTING_TYPE_ICONS` allowlist. Responses type both fields as nullable strings
 * (looser than the write schemas so legacy rows still deserialize), so accept
 * `string | null | undefined` and render nothing when neither is set or the name
 * is unknown.
 */
export function ListingTypeIcon({
  imageUrl,
  name,
  className,
}: {
  imageUrl?: string | null;
  name?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        className={cn(className, 'object-contain')}
        aria-hidden
      />
    );
  }
  if (!name) return null;
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon | undefined>)[name];
  return Icon ? <Icon className={className} aria-hidden /> : null;
}
