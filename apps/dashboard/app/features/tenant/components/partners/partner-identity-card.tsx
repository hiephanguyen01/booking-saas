import type { PartnerDocumentReadItem, PartnerResponse } from '@booking/contracts';
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
import { IDENTITY_DOCUMENT_LABEL } from '~/constants/partner';
import { formatDate } from '~/lib/format';
import { CopyableCode } from '~/components/copyable-code';
import { EnumValue } from '~/components/enum-value';
import { PhotoStrip } from '~/components/photo-strip';
import type { BusinessInfoView } from '~/features/tenant/lib/partner-business-info';

function documentUrl(document: PartnerDocumentReadItem): string {
  return document.storage === 'private' ? document.downloadUrl : document.url;
}

/**
 * Identity review card — the metadata to reconcile against the submitted ID
 * scans, plus permission-gated scan descriptors and any prior review note.
 */
export function PartnerIdentityCard({
  partner,
  business,
  documents,
}: {
  partner: PartnerResponse;
  business: BusinessInfoView;
  documents: PartnerDocumentReadItem[];
}) {
  const identity = partner.identityInfo;
  const identityPhotos = documents
    .filter(
      (document) =>
        document.kind === 'identity_card_front' || document.kind === 'identity_card_back',
    )
    .map(documentUrl);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh tính</CardTitle>
        <CardDescription>
          Đối chiếu thông tin dưới đây với ảnh giấy tờ. Hệ thống từ chối nếu dưới 18 tuổi hoặc tên
          không khớp tài khoản nhận tiền.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailGrid>
          <DetailField
            label="Loại giấy tờ"
            value={
              identity.documentType ? (
                <EnumValue map={IDENTITY_DOCUMENT_LABEL} value={identity.documentType} />
              ) : null
            }
          />
          <DetailField
            label="Số giấy tờ"
            value={
              identity.documentNumber ? (
                <CopyableCode value={identity.documentNumber} label="số giấy tờ" />
              ) : null
            }
          />
          <DetailField label="Họ tên trên giấy tờ" value={identity.holderName} />
          <DetailField label="Người đại diện" value={business.representativeName} />
          <DetailField
            label="Ngày sinh"
            value={partner.dateOfBirth ? formatDate(partner.dateOfBirth) : null}
          />
          {identity.reviewNote ? (
            <DetailField
              span={2}
              label={partner.verificationStatus === 'rejected' ? 'Lý do từ chối' : 'Ghi chú xét duyệt'}
              value={
                <span
                  className={partner.verificationStatus === 'rejected' ? 'text-warning' : undefined}
                >
                  {identity.reviewNote}
                </span>
              }
            />
          ) : null}
        </DetailGrid>

        <DetailSection
          title="Ảnh giấy tờ tuỳ thân"
          emptyMessage="Đối tác chưa tải ảnh giấy tờ tuỳ thân."
        >
          {identityPhotos.length > 0 ? (
            <PhotoStrip photos={identityPhotos} alt="Giấy tờ tuỳ thân" />
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}
