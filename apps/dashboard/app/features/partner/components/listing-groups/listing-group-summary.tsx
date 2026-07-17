import type { ListingGroupDetailResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Progress } from '@booking/ui/components/ui/progress';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { MODERATION_ACTOR_LABEL } from '~/constants/listing';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { PhotoStrip } from '~/components/photo-strip';
import { CopyableCode } from '~/components/copyable-code';
import { ListingStatusBadge } from '~/components/status-badge';

/** Full address line from the group's stored address snapshot. */
function addressLine(group: ListingGroupDetailResponse): string {
  return [group.address, group.wardName, group.provinceName].filter(Boolean).join(', ');
}

/** "Tổng quan" — slug, price-from, lifecycle metadata and readiness progress. */
export function ListingGroupOverviewCard({ group }: { group: ListingGroupDetailResponse }) {
  const readyPct =
    group.listingCount > 0 ? Math.round((group.readyListingCount / group.listingCount) * 100) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tổng quan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailGrid columns={3}>
          <DetailField
            label="Đường dẫn"
            value={<CopyableCode value={`/${group.slug}`} label="đường dẫn" />}
          />
          <DetailField
            label="Giá từ"
            emphasis="strong"
            value={group.priceFrom ? <Money value={group.priceFrom} /> : undefined}
          />
          <DetailField label="Trạng thái" value={<ListingStatusBadge status={group.status} />} />
          <DetailField label="Ngày tạo" value={<DateTimeValue iso={group.createdAt} />} />
          <DetailField label="Cập nhật" value={<DateTimeValue iso={group.updatedAt} relative />} />
          <DetailField
            label="Xuất bản bởi"
            omitWhenEmpty
            value={
              group.publishedBy ? (
                <EnumValue map={MODERATION_ACTOR_LABEL} value={group.publishedBy} />
              ) : undefined
            }
          />
          <DetailField
            label="Ẩn bởi"
            omitWhenEmpty
            value={
              group.hiddenBy ? (
                <EnumValue map={MODERATION_ACTOR_LABEL} value={group.hiddenBy} />
              ) : undefined
            }
          />
        </DetailGrid>
        <DetailSection
          title="Tiến độ"
          description={`${group.readyListingCount}/${group.listingCount} ${group.itemLabel} đạt mức sẵn sàng (đủ ảnh, mô tả và giá).`}
        >
          <div className="space-y-1.5">
            <Progress value={readyPct} />
            <p className="text-xs text-muted-foreground">{readyPct}% hoàn thiện</p>
          </div>
        </DetailSection>
      </CardContent>
    </Card>
  );
}

/** "Nội dung" — album, description, address and amenities shared by the group. */
export function ListingGroupContentCard({ group }: { group: ListingGroupDetailResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung</CardTitle>
        <CardDescription>Album và thông tin dùng chung cho toàn bộ bài đăng.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailSection title="Ảnh" emptyMessage="Chưa có ảnh.">
          {group.photos.length ? <PhotoStrip photos={group.photos} alt={group.title} /> : null}
        </DetailSection>
        <DetailSection title="Mô tả" emptyMessage="Chưa có mô tả.">
          {group.description ? (
            <p className="whitespace-pre-wrap text-sm">{group.description}</p>
          ) : null}
        </DetailSection>
        <DetailGrid>
          <DetailField label="Khu vực hoạt động" value={group.workingArea} />
          <DetailField label="Địa chỉ" value={addressLine(group) || undefined} />
        </DetailGrid>
        <DetailSection title="Tiện ích" emptyMessage="Chưa có tiện ích.">
          {group.amenities.length ? (
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
