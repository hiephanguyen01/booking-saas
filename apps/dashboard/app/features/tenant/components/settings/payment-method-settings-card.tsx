import type { GatewayPaymentSettings } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Form, useNavigation } from 'react-router';

const METHODS = [
  ['bank_transfer', 'Chuyển khoản ngân hàng'],
  ['napas_qr', 'Napas QR / thẻ nội địa'],
  ['international_card', 'Visa / Mastercard / JCB'],
] as const;

export function PaymentMethodSettingsCard({
  settings,
  readOnly,
  error,
  success,
}: {
  settings: GatewayPaymentSettings;
  readOnly: boolean;
  error: string | null;
  success: boolean;
}) {
  const navigation = useNavigation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phương thức thanh toán và hoàn tiền</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-5">
          <input type="hidden" name="intent" value="payment-settings" />
          <fieldset disabled={readOnly} className="space-y-3">
            <legend className="mb-2 text-sm font-medium">Hiển thị tại trang thanh toán</legend>
            {METHODS.map(([value, label]) => (
              <Label key={value} className="flex items-center gap-3 font-normal">
                <input
                  type="checkbox"
                  name="enabledMethods"
                  value={value}
                  defaultChecked={settings.enabledMethods.includes(value)}
                  className="size-4"
                />
                {label}
              </Label>
            ))}
          </fieldset>

          <fieldset disabled={readOnly} className="space-y-3">
            <legend className="mb-2 text-sm font-medium">Cách xử lý hoàn tiền</legend>
            <Label className="flex items-start gap-3 font-normal">
              <input
                type="radio"
                name="refundStrategy"
                value="manual"
                defaultChecked={settings.refundStrategy === 'manual'}
              />
              <span>
                <strong>Thủ công</strong>
                <br />
                <span className="text-muted-foreground">
                  Nhân viên chuyển tiền và xác nhận mã giao dịch.
                </span>
              </span>
            </Label>
            <Label className="flex items-start gap-3 font-normal">
              <input
                type="radio"
                name="refundStrategy"
                value="automatic_preferred"
                defaultChecked={settings.refundStrategy === 'automatic_preferred'}
              />
              <span>
                <strong>Ưu tiên tự động</strong>
                <br />
                <span className="text-muted-foreground">
                  Tự động void giao dịch thẻ đủ điều kiện; trường hợp còn lại chuyển sang thủ công.
                </span>
              </span>
            </Label>
          </fieldset>

          <div className="max-w-xs space-y-2">
            <Label htmlFor="manualRefundSlaHours">Thời hạn xử lý thủ công (giờ)</Label>
            <Input
              id="manualRefundSlaHours"
              name="manualRefundSlaHours"
              type="number"
              min={1}
              max={720}
              defaultValue={settings.manualRefundSlaHours}
              disabled={readOnly}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">Đã lưu cài đặt thanh toán.</p> : null}
          <Button type="submit" disabled={readOnly || navigation.state !== 'idle'}>
            Lưu cài đặt
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
