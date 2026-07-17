import * as React from 'react';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { CopyableCode } from '~/components/copyable-code';
import { DateTimeValue } from '~/components/date-time-value';
import { EntityRef } from '~/components/entity-ref';
import { CommissionRows, type CommissionRow } from './commission-summary';

/**
 * The tenant-only block of the metadata section — partner link, affiliate
 * attribution, frozen commission split and the partner's internal note. The
 * partner audience never receives these fields, so it simply omits the prop.
 */
export interface BookingMetaTenantInfo {
  partnerName: string | null;
  partnerHref: string | null;
  affiliateId: string | null;
  referralCode: string | null;
  commissionRows: CommissionRow[];
  partnerNote: string | null;
}

/** The "Thông tin khác" section of the booking detail (timestamps + tenant extras). */
export function BookingMetaSection({
  createdAt,
  updatedAt,
  tenant,
}: {
  createdAt: string;
  updatedAt: string;
  /** Present only on the tenant surface. */
  tenant?: BookingMetaTenantInfo;
}): React.JSX.Element {
  return (
    <DetailSection title="Thông tin khác">
      <DetailGrid columns={2}>
        <DetailField label="Tạo lúc" value={<DateTimeValue iso={createdAt} relative />} />
        <DetailField label="Cập nhật" value={<DateTimeValue iso={updatedAt} relative />} />
        {tenant ? (
          <>
            <DetailField
              label="Đối tác"
              value={
                <EntityRef
                  to={tenant.partnerHref ?? null}
                  name={tenant.partnerName ?? 'Xem đối tác'}
                  fallback={<span className="text-foreground">{tenant.partnerName ?? '—'}</span>}
                />
              }
            />
            {tenant.affiliateId ? (
              <DetailField
                label="Cộng tác viên giới thiệu"
                value={
                  <EntityRef
                    to={`/tenant/affiliates/${tenant.affiliateId}`}
                    name={tenant.referralCode ?? 'Xem cộng tác viên'}
                  />
                }
                hint={
                  tenant.referralCode ? (
                    <CopyableCode value={tenant.referralCode} label="mã giới thiệu" />
                  ) : undefined
                }
              />
            ) : null}
            {tenant.commissionRows.length > 0 ? (
              <DetailField
                label="Hoa hồng (đã chốt)"
                span={2}
                value={<CommissionRows rows={tenant.commissionRows} />}
              />
            ) : null}
            {tenant.partnerNote ? (
              <DetailField
                label="Ghi chú nội bộ của đối tác"
                value={tenant.partnerNote}
                span={2}
              />
            ) : null}
          </>
        ) : null}
      </DetailGrid>
    </DetailSection>
  );
}
