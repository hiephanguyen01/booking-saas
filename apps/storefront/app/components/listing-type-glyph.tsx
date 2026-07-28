import type { PublicListingTypeResponse } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { typeIcon } from '~/lib/ui';
import { LucideByName } from './lucide-by-name';

/**
 * The glyph for a tenant-defined listing type, driven entirely by the tenant's
 * config: an uploaded `iconImageUrl` wins, then the tenant-chosen lucide `icon`
 * NAME, and only when neither is set does it fall back to the slug-based
 * {@link typeIcon} map. Shared by every place that renders a listing-type chip so
 * they all reflect what the tenant created — never a hard-coded category set.
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
  return <LucideByName name={type.icon} fallback={typeIcon(type.slug)} className={className} />;
}
