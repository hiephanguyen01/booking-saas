import type { ListingGroupDetailResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { PhotoAndDescriptionSections, AmenitiesSection } from '~/components/media-detail-sections';

/** Full address line from the group's stored address snapshot. */
function addressLine(group: ListingGroupDetailResponse): string {
  return [group.address, group.wardName, group.provinceName].filter(Boolean).join(', ');
}

/** "Nội dung" — album, description, address and amenities shared by the group. */
export function ListingGroupContentCard({ group }: { group: ListingGroupDetailResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung</CardTitle>
        <CardDescription>Album và thông tin dùng chung cho toàn bộ tin đăng.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <PhotoAndDescriptionSections
          photos={group.photos}
          alt={group.title}
          description={group.description}
        />
        <DetailGrid>
          <DetailField label="Khu vực hoạt động" value={group.workingArea} />
          <DetailField label="Địa chỉ" value={addressLine(group) || undefined} />
        </DetailGrid>
        <AmenitiesSection amenities={group.amenities} />
      </CardContent>
    </Card>
  );
}
