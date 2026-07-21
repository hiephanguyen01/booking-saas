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
import { formatLocation } from '~/lib/format';
import { Money } from '~/components/money';
import { PhotoAndDescriptionSections, AmenitiesSection } from '~/components/media-detail-sections';

/** "Nội dung chung" — album, description and amenities shared by the whole post. */
export function GroupContentCard({ group }: { group: ListingGroupDetailResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung chung</CardTitle>
        <CardDescription>Album và nội dung dùng chung cho toàn bộ tin đăng.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailGrid columns={3}>
          <DetailField
            label="Giá từ"
            emphasis="strong"
            value={group.priceFrom ? <Money value={group.priceFrom} /> : null}
          />
          <DetailField label="Số hạng mục" value={`${group.listingCount} ${group.itemLabel}`} />
          <DetailField label="Khu vực hoạt động" value={group.workingArea} />
          <DetailField
            label="Địa chỉ"
            span={3}
            value={formatLocation(group.address, group.wardName, group.provinceName)}
          />
        </DetailGrid>

        <PhotoAndDescriptionSections
          photos={group.photos}
          alt={group.title}
          description={group.description}
        />

        <AmenitiesSection amenities={group.amenities} />
      </CardContent>
    </Card>
  );
}
