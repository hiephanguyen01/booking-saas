import type { PublicListingTypeResponse } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { Tag } from 'lucide-react';
import { LucideByName } from './lucide-by-name';

/**
 * The glyph for a tenant-defined listing type, driven entirely by the tenant's
 * config: an uploaded `iconImageUrl` wins, then the tenant-chosen lucide `icon`
 * NAME, and a neutral `Tag` when neither is set. Shared by every place that
 * renders a listing-type chip so they all reflect what the tenant created —
 * never a hard-coded category set.
 */
export function ListingTypeGlyph({
  type,
  className,
}: {
  type: Pick<PublicListingTypeResponse, 'slug' | 'icon' | 'iconImageUrl'>;
  className?: string;
}) {
  if (type.iconImageUrl) {
    return (
      <img
        src={type.iconImageUrl}
        alt=""
        className={cn(className, 'object-contain')}
        aria-hidden="true"
      />
    );
  }
  return <LucideByName name={type.icon} fallback={Tag} className={className} />;
}
