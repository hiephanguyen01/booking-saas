import { useFetcher } from 'react-router';
import type { AffiliateDetailResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { TriangleAlert } from 'lucide-react';
import { RATE_SOURCE_LABEL } from '~/constants/affiliate';
import { formatDiscount } from '~/lib/format';
import { DateTimeValue } from '~/components/date-time-value';
import { PartnerStatusBadge } from '~/components/status-badge';
import type { AffiliateDetailActionData } from './types';

/**
 * The detail page's left column: profile snapshot, the custom-rate override
 * form, and the payout account (with a warning empty state — no account means
 * no commission can be paid).
 */
export function AffiliateProfilePanel({
  affiliate,
}: {
  affiliate: AffiliateDetailResponse['affiliate'];
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hồ sơ</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid columns={1}>
            <DetailField label="Trạng thái" value={<PartnerStatusBadge status={affiliate.status} />} />
            <DetailField label="Email" value={affiliate.userEmail} />
            <DetailField label="Điện thoại" value={affiliate.phone ?? ''} />
            <DetailField label="Tham gia" value={<DateTimeValue iso={affiliate.createdAt} />} />
          </DetailGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hoa hồng riêng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <RateForm currentRate={affiliate.customRate} />
          <DetailGrid columns={1}>
            <DetailField
              label="Mức áp dụng"
              emphasis="strong"
              value={formatDiscount(affiliate.effectiveRateType, affiliate.effectiveRate)}
              hint={RATE_SOURCE_LABEL[affiliate.effectiveRateSource]}
            />
          </DetailGrid>
          <p className="text-xs text-muted-foreground">
            Để trống để dùng mức hoa hồng theo quy tắc của tenant. Ưu tiên: hoa hồng riêng &gt; quy
            tắc &gt; mặc định.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tài khoản nhận tiền</CardTitle>
        </CardHeader>
        <CardContent>
          <PayoutInfo payoutInfo={affiliate.payoutInfo} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The affiliate's bank details — what the tenant pays into. Rendered with a
 * warning-toned empty state because a payout cannot be made without an account.
 * `note` alone doesn't count as payable details.
 */
function PayoutInfo({
  payoutInfo,
}: {
  payoutInfo: AffiliateDetailResponse['affiliate']['payoutInfo'];
}) {
  const hasAccount = Boolean(
    payoutInfo.bankName || payoutInfo.accountNo || payoutInfo.accountHolder,
  );
  if (!hasAccount) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground dark:text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          Cộng tác viên chưa cung cấp thông tin tài khoản. Không thể chi hoa hồng cho đến khi họ cập
          nhật trong cổng cộng tác viên.
        </p>
      </div>
    );
  }
  return (
    <DetailGrid columns={1}>
      <DetailField label="Ngân hàng" value={payoutInfo.bankName ?? ''} />
      <DetailField label="Số tài khoản" value={payoutInfo.accountNo ?? ''} emphasis="strong" />
      <DetailField label="Chủ tài khoản" value={payoutInfo.accountHolder ?? ''} />
      {payoutInfo.note ? <DetailField label="Ghi chú" value={payoutInfo.note} /> : null}
    </DetailGrid>
  );
}

/** Custom-rate override — posts `intent=rate` to the detail route's action. */
function RateForm({ currentRate }: { currentRate: string | null }) {
  const fetcher = useFetcher<AffiliateDetailActionData>();
  const busy = fetcher.state !== 'idle';
  return (
    <fetcher.Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="rate" />
      <div className="relative flex-1">
        <Input
          name="customRate"
          type="number"
          min={0}
          max={100}
          defaultValue={currentRate ?? ''}
          placeholder="Theo quy tắc"
          // pr-7 trails the control's px-4 so the "%" suffix stays clear.
          className="pr-7"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        Lưu
      </Button>
    </fetcher.Form>
  );
}
