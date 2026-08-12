import * as React from 'react';
import type { PartnerBookingSettlementResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DateTimeValue } from '~/components/date-time-value';
import { Money } from '~/components/money';
import { SETTLEMENT_STATUS_LABEL } from '~/constants/finance';
import { SettlementTaxTrail } from './settlement-tax-trail';

/** Partner-safe settlement view; tenant/platform/affiliate internals never reach this component. */
export function PartnerBookingSettlementCard({
  settlement,
}: {
  settlement: PartnerBookingSettlementResponse;
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-6">
        <DetailSection
          title="Đối soát thu nhập"
          description="Tenant giữ tiền online đến hết hạn tranh chấp, sau đó mới đưa phần phải trả vào kỳ chi."
        >
          <DetailGrid columns={3}>
            <DetailField
              label="Trạng thái"
              value={
                <Badge variant={settlement.status === 'disputed' ? 'destructive' : 'secondary'}>
                  {SETTLEMENT_STATUS_LABEL[settlement.status]}
                </Badge>
              }
            />
            <DetailField label="Phần Partner" value={<Money value={settlement.partnerGrossEarning} />} />
            <DetailField label="Tenant phải trả" value={<Money value={settlement.partnerPayable} />} emphasis="strong" />
            <DetailField label="Đang nằm trong lệnh chi" value={<Money value={settlement.payoutPendingAmount} />} />
            <DetailField label="Đã nhận" value={<Money value={settlement.paidAmount} />} />
            <DetailField label="Còn chờ chi" value={<Money value={settlement.remainingPayableAmount} />} emphasis="strong" />
            <DetailField label="Hạn tranh chấp" value={settlement.disputeUntil ? <DateTimeValue iso={settlement.disputeUntil} /> : undefined} />
            <DetailField label="Mã chuyển khoản" value={settlement.latestPayoutReference ?? undefined} />
            <DetailField label="Ngày nhận" value={settlement.latestPayoutPaidAt ? <DateTimeValue iso={settlement.latestPayoutPaidAt} /> : undefined} />
          </DetailGrid>
        </DetailSection>
        <SettlementTaxTrail taxPosition={settlement.taxPosition} />
      </CardContent>
    </Card>
  );
}
