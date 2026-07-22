import type { ListingResponse } from '@booking/contracts';
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
import { BALANCE_DUE_LABEL } from '~/features/tenant/constants';
import { CancellationTiers } from '~/components/cancellation-tiers';
import { Money } from '~/components/money';
import { EnumValue } from '~/components/enum-value';

/** "Chính sách" — deposit, buffers, cancellation tiers, reschedule terms. */
export function ListingPolicyCard({ listing }: { listing: ListingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chính sách</CardTitle>
        <CardDescription>Điều khoản áp dụng cho mọi lượt đặt của tin đăng.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailGrid columns={3}>
          <DetailField label="Đặt cọc" value={`${listing.depositPercent}%`} />
          <DetailField
            label="Thanh toán còn lại"
            value={<EnumValue map={BALANCE_DUE_LABEL} value={listing.balanceDue} />}
          />
          <DetailField label="Yêu cầu duyệt đặt" value={listing.approvalRequired ? 'Có' : 'Không'} />
          <DetailField label="Đệm trước" value={`${listing.bufferBefore} phút`} />
          <DetailField label="Đệm sau" value={`${listing.bufferAfter} phút`} />
          <DetailField
            label="Tồn kho"
            value={listing.stockQuantity !== null ? String(listing.stockQuantity) : null}
            omitWhenEmpty
          />
          <DetailField
            label="Sức chứa"
            value={listing.capacity !== null ? String(listing.capacity) : null}
            omitWhenEmpty
          />
        </DetailGrid>

        <DetailSection title="Chính sách huỷ" emptyMessage="Chưa gắn chính sách huỷ.">
          {listing.cancellationPolicy ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{listing.cancellationPolicy.name}</p>
              <CancellationTiers rules={listing.cancellationPolicy.rules} />
            </div>
          ) : null}
        </DetailSection>

        <DetailSection title="Đổi lịch">
          <DetailGrid columns={3}>
            <DetailField
              label="Cho phép đổi lịch"
              value={listing.rescheduleAllowed ? 'Có' : 'Không'}
            />
            {listing.rescheduleAllowed ? (
              <>
                <DetailField
                  label="Hạn đổi lịch"
                  value={
                    listing.rescheduleDeadlineHours !== null
                      ? `Trước ${listing.rescheduleDeadlineHours} giờ`
                      : 'Không giới hạn'
                  }
                />
                <DetailField
                  label="Phí đổi lịch"
                  value={
                    listing.rescheduleFee !== null ? (
                      <Money value={listing.rescheduleFee} />
                    ) : (
                      'Miễn phí'
                    )
                  }
                />
              </>
            ) : null}
          </DetailGrid>
        </DetailSection>
      </CardContent>
    </Card>
  );
}

