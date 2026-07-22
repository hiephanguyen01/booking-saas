import { Badge } from '@booking/ui/components/ui/badge';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { PhotoStrip } from '~/components/photo-strip';

/**
 * "Ảnh" + "Mô tả" `DetailSection`s — the identical pair reused by the tenant
 * listing/group review content cards and the partner listing-group content
 * card. `photoEmptyMessage` is the one spot the copy differs between call
 * sites (single listing vs. group), so it stays a prop rather than a
 * hardcoded string.
 */
export function PhotoAndDescriptionSections({
  photos,
  alt,
  description,
  photoEmptyMessage = 'Chưa có ảnh.',
}: {
  photos: string[];
  alt: string;
  description: string | null;
  photoEmptyMessage?: string;
}) {
  return (
    <>
      <DetailSection title="Ảnh" emptyMessage={photoEmptyMessage}>
        {photos.length > 0 ? <PhotoStrip photos={photos} alt={alt} /> : null}
      </DetailSection>

      <DetailSection title="Mô tả" emptyMessage="Chưa có mô tả.">
        {description ? <p className="whitespace-pre-wrap text-sm">{description}</p> : null}
      </DetailSection>
    </>
  );
}

/**
 * "Tiện ích" `DetailSection` — amenity badges shared by the tenant group
 * review content card and the partner listing-group content card.
 */
export function AmenitiesSection({ amenities }: { amenities: string[] }) {
  return (
    <DetailSection title="Tiện ích" emptyMessage="Chưa có tiện ích.">
      {amenities.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {amenities.map((amenity) => (
            <Badge key={amenity} variant="secondary">
              {amenity}
            </Badge>
          ))}
        </div>
      ) : null}
    </DetailSection>
  );
}
