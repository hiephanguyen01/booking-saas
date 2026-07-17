import type { PartnerResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { WarningCallout } from '~/components/warning-callout';

/**
 * Payout account card — ALWAYS rendered: an empty payout hard-fails identity
 * verification, so the empty state is a warning, not a blank.
 */
export function PartnerPayoutCard({ payoutInfo }: { payoutInfo: PartnerResponse['payoutInfo'] }) {
  const payout = payoutInfo as { bank?: string; accountNumber?: string; holderName?: string };
  const hasPayout = Boolean(payout?.bank || payout?.accountNumber || payout?.holderName);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tài khoản nhận tiền</CardTitle>
        <CardDescription>
          Dùng để chi trả doanh thu — tên chủ tài khoản phải khớp giấy tờ.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasPayout ? (
          <DetailGrid>
            <DetailField label="Ngân hàng" value={payout.bank} />
            <DetailField label="Số tài khoản" value={payout.accountNumber} />
            <DetailField label="Chủ tài khoản" value={payout.holderName} span={2} />
          </DetailGrid>
        ) : (
          <WarningCallout title="Chưa có tài khoản nhận tiền">
            <p className="text-muted-foreground">
              Không thể xác minh danh tính khi thiếu — hệ thống sẽ báo lỗi trùng khớp tên
              (NAME_MISMATCH). Yêu cầu đối tác bổ sung trước khi duyệt.
            </p>
          </WarningCallout>
        )}
      </CardContent>
    </Card>
  );
}
