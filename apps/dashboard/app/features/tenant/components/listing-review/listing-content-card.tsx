import type { ListingResponse, ListingTypeResponse } from '@booking/contracts';
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
import { MODERATION_ACTOR_LABEL } from '~/constants/listing';
import { PhotoStrip } from '~/components/photo-strip';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';

/** "Nội dung" — the photos, description and location the partner submitted. */
export function ListingContentCard({
  listing,
  type,
}: {
  listing: ListingResponse;
  type?: ListingTypeResponse | null;
}) {
  const hasLocation = Boolean(listing.address || listing.wardName || listing.provinceName);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung</CardTitle>
        <CardDescription>Nội dung đối tác gửi lên để kiểm duyệt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailGrid columns={1}>
          <DetailField label="Loại dịch vụ" value={type?.name ?? '—'} />
        </DetailGrid>

        <DetailSection title="Ảnh" emptyMessage="Chưa có ảnh nào.">
          {listing.photos.length > 0 ? <PhotoStrip photos={listing.photos} alt={listing.title} /> : null}
        </DetailSection>

        <DetailSection title="Mô tả" emptyMessage="Chưa có mô tả.">
          {listing.description ? (
            <p className="whitespace-pre-wrap text-sm">{listing.description}</p>
          ) : null}
        </DetailSection>

        <DetailSection title="Vị trí" emptyMessage="Chưa có địa chỉ.">
          {hasLocation ? (
            <DetailGrid columns={2}>
              <DetailField label="Địa chỉ" value={listing.address} span={2} />
              <DetailField label="Phường / Xã" value={listing.wardName} />
              <DetailField label="Tỉnh / Thành" value={listing.provinceName} />
            </DetailGrid>
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}

/** "Trạng thái & nhật ký" — who published/hid the listing and when. */
export function ListingModerationLogCard({ listing }: { listing: ListingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trạng thái &amp; nhật ký</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGrid columns={3}>
          <DetailField
            label="Xuất bản bởi"
            value={
              listing.publishedBy ? (
                <EnumValue map={MODERATION_ACTOR_LABEL} value={listing.publishedBy} />
              ) : null
            }
          />
          <DetailField
            label="Ẩn bởi"
            value={
              listing.hiddenBy ? (
                <EnumValue map={MODERATION_ACTOR_LABEL} value={listing.hiddenBy} />
              ) : null
            }
          />
          <DetailField
            label="Gửi duyệt lúc"
            value={listing.submittedAt ? <DateTimeValue iso={listing.submittedAt} /> : null}
          />
          <DetailField
            label="Xuất bản lần đầu"
            value={listing.publishedAt ? <DateTimeValue iso={listing.publishedAt} /> : null}
          />
          <DetailField label="Tạo lúc" value={<DateTimeValue iso={listing.createdAt} />} />
          <DetailField label="Cập nhật lúc" value={<DateTimeValue iso={listing.updatedAt} relative />} />
        </DetailGrid>
      </CardContent>
    </Card>
  );
}
