import type { ListingGroupDetailResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { formatLocation } from '~/lib/format';
import { Money } from '~/components/money';
import { PhotoStrip } from '~/components/photo-strip';

/** "Nội dung chung" — album, description and amenities shared by the whole post. */
export function GroupContentCard({ group }: { group: ListingGroupDetailResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung chung</CardTitle>
        <CardDescription>Album và nội dung dùng chung cho toàn bộ bài đăng.</CardDescription>
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

        <DetailSection title="Ảnh" emptyMessage="Chưa có ảnh.">
          {group.photos.length > 0 ? <PhotoStrip photos={group.photos} alt={group.title} /> : null}
        </DetailSection>

        <DetailSection title="Mô tả" emptyMessage="Chưa có mô tả.">
          {group.description ? (
            <p className="whitespace-pre-wrap text-sm">{group.description}</p>
          ) : null}
        </DetailSection>

        <DetailSection title="Tiện ích" emptyMessage="Chưa có tiện ích.">
          {group.amenities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {group.amenities.map((amenity) => (
                <Badge key={amenity} variant="secondary">
                  {amenity}
                </Badge>
              ))}
            </div>
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}
