import type { PartnerResponse } from '@booking/contracts';
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
import { PhotoStrip } from '~/components/photo-strip';
import type { BusinessInfoView } from '~/features/tenant/lib/partner-business-info';

/**
 * Legal profile card — business registration details + license documents.
 * Hidden for house partners (they have no external legal profile to review).
 */
export function PartnerLegalCard({
  partner,
  business,
}: {
  partner: PartnerResponse;
  business: BusinessInfoView;
}) {
  if (partner.isHouse) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hồ sơ pháp lý</CardTitle>
        <CardDescription>Thông tin và giấy phép đối tác đã cung cấp khi đăng ký.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {partner.description ? (
          <DetailGrid columns={1}>
            <DetailField label="Giới thiệu" value={partner.description} />
          </DetailGrid>
        ) : null}

        <DetailSection
          title="Thông tin pháp lý"
          emptyMessage="Đối tác chưa cung cấp thông tin pháp lý."
        >
          {business.legalDetails.length > 0 ? (
            <DetailGrid>
              {business.legalDetails.map((detail) => (
                <DetailField key={detail.label} label={detail.label} value={detail.value} />
              ))}
              {business.logoUrl ? (
                <DetailField
                  label="Logo"
                  value={<PhotoStrip photos={[business.logoUrl]} alt="Logo đối tác" />}
                  span={2}
                />
              ) : null}
            </DetailGrid>
          ) : business.logoUrl ? (
            <PhotoStrip photos={[business.logoUrl]} alt="Logo đối tác" />
          ) : null}
        </DetailSection>

        <DetailSection
          title="Giấy phép kinh doanh"
          emptyMessage="Đối tác chưa cung cấp giấy phép kinh doanh."
        >
          {business.licensePhotos.length > 0 ? (
            <PhotoStrip photos={business.licensePhotos} alt="Giấy phép" />
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}
