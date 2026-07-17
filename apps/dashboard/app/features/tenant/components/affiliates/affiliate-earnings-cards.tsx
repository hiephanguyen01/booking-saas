import type { AffiliateDetailResponse } from '@booking/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { formatRate } from '~/lib/format';
import { Money } from '~/components/money';
import { StatCard } from '~/components/stat-card';

/** Earnings breakdown (per commission state) + traffic performance cards. */
export function AffiliateEarningsCards({
  affiliate,
}: {
  affiliate: AffiliateDetailResponse['affiliate'];
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thu nhập</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Chờ xác nhận"
              value={<Money value={affiliate.pendingCommission} />}
              tone="muted"
            />
            <StatCard
              label="Cần chi (đã xác nhận)"
              value={<Money value={affiliate.confirmedCommission} />}
              tone="positive"
            />
            <StatCard label="Đã chi" value={<Money value={affiliate.paidCommission} />} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Đã huỷ"
              value={<Money value={affiliate.reversedCommission} />}
              hint="Hoa hồng bị huỷ trước khi hoàn tất — không phải chi."
              tone="muted"
            />
            <StatCard
              label="Đã thu hồi"
              value={<Money value={affiliate.clawedBackCommission} />}
              hint="Hoa hồng bị thu hồi sau tranh chấp/hoàn tiền."
              tone="warning"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hiệu quả</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid columns={3}>
            <DetailField
              label="Lượt click"
              value={<span className="tabular-nums">{affiliate.clicks}</span>}
            />
            <DetailField
              label="Đơn đặt"
              value={<span className="tabular-nums">{affiliate.bookings}</span>}
            />
            <DetailField label="Tỷ lệ chuyển đổi" value={formatRate(affiliate.conversionRate)} />
          </DetailGrid>
        </CardContent>
      </Card>
    </>
  );
}
