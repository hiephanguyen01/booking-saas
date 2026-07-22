import * as React from 'react';
import type { BookingSettlementResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DateTimeValue } from '~/components/date-time-value';
import { Money } from '~/components/money';
import { SETTLEMENT_STATUS_LABEL } from '~/constants/finance';

/** Custody and split state shown beside a booking to tenant and owning partner. */
export function BookingSettlementCard({
  settlement,
}: {
  settlement: BookingSettlementResponse;
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-6">
        <DetailSection
          title="Đối soát thanh toán"
          description="Tiền online do Tenant giữ; công nợ Partner chỉ vào sổ cái sau hạn tranh chấp."
        >
          <DetailGrid columns={3}>
            <DetailField
              label="Trạng thái"
              value={
                <Badge
                  variant={
                    settlement.status === 'disputed'
                      ? 'destructive'
                      : settlement.status === 'released'
                        ? 'default'
                        : 'secondary'
                  }
                >
                  {SETTLEMENT_STATUS_LABEL[settlement.status]}
                </Badge>
              }
            />
            <DetailField
              label="Tenant giữ online"
              value={<Money value={settlement.remainingHeldAmount} />}
              emphasis="strong"
            />
            <DetailField
              label="Partner thu tại chỗ"
              value={<Money value={settlement.onsiteCollectedAmount} />}
            />
            <DetailField
              label="Hoa hồng Tenant (gộp)"
              value={<Money value={settlement.tenantCommissionGross} />}
            />
            <DetailField
              label="Tenant thực nhận"
              value={<Money value={settlement.tenantNetEarning} />}
              emphasis="strong"
            />
            <DetailField label="Phí nền tảng" value={<Money value={settlement.platformFee} />} />
            <DetailField
              label="Hoa hồng cộng tác viên"
              value={<Money value={settlement.affiliateCommission} />}
            />
            <DetailField
              label="Phần Partner (gộp)"
              value={<Money value={settlement.partnerGrossEarning} />}
            />
            <DetailField
              label="Tenant sẽ chi Partner"
              value={<Money value={settlement.partnerPayable} />}
              emphasis="strong"
            />
            {settlement.refundedAmount !== '0' ? (
              <DetailField
                label="Đã hoàn khách"
                value={<Money value={settlement.refundedAmount} />}
              />
            ) : null}
            {settlement.retainedAmount !== '0' ? (
              <DetailField
                label="Phần giữ lại"
                value={<Money value={settlement.retainedAmount} />}
              />
            ) : null}
            <DetailField
              label="Đang nằm trong lệnh chi"
              value={<Money value={settlement.payoutPendingAmount} />}
            />
            <DetailField
              label="Đã chuyển Partner"
              value={<Money value={settlement.paidAmount} />}
            />
            <DetailField
              label="Còn phải chi Partner"
              value={<Money value={settlement.remainingPayableAmount} />}
              emphasis="strong"
            />
            <DetailField
              label="Mã chuyển khoản gần nhất"
              value={settlement.latestPayoutReference ?? undefined}
            />
            <DetailField
              label="Hạn tranh chấp"
              value={
                settlement.disputeUntil ? (
                  <DateTimeValue iso={settlement.disputeUntil} />
                ) : undefined
              }
            />
            <DetailField
              label="Đã giải phóng"
              value={
                settlement.releasedAt ? <DateTimeValue iso={settlement.releasedAt} /> : undefined
              }
            />
            {settlement.securityDepositHeld !== '0' ? (
              <DetailField
                label="Cọc bảo đảm giữ riêng"
                value={<Money value={settlement.securityDepositHeld} />}
              />
            ) : null}
          </DetailGrid>
        </DetailSection>
      </CardContent>
    </Card>
  );
}
