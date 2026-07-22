import { useState } from 'react';
import type { GatewayPaymentSettings } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { CreditCard, RotateCcw } from 'lucide-react';
import { Form, useNavigation } from 'react-router';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';

const METHODS = [
  ['bank_transfer', 'Chuyển khoản ngân hàng', 'VietQR và chuyển khoản theo thông tin đơn hàng.'],
  ['napas_qr', 'Napas QR và thẻ nội địa', 'Cho phép khách thanh toán qua mạng lưới Napas.'],
  ['international_card', 'Thẻ quốc tế', 'Visa, Mastercard và JCB khi merchant hỗ trợ.'],
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
  const [refundStrategy, setRefundStrategy] = useState(settings.refundStrategy);
  const isSubmitting =
    navigation.state === 'submitting' && navigation.formData?.get('intent') === 'payment-settings';

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" aria-hidden="true" /> Phương thức thanh toán
        </CardTitle>
        <CardDescription>
          Chọn cách khách thanh toán và cách đội ngũ xử lý yêu cầu hoàn tiền.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="payment-settings" />
          <ErrorBanner error={error} />
          <SuccessBanner message={success ? 'Đã lưu phương thức thanh toán và hoàn tiền.' : null} />

          <fieldset disabled={readOnly || isSubmitting} className="space-y-3">
            <legend className="text-sm font-semibold">Hiển thị tại trang thanh toán</legend>
            <p className="text-xs leading-5 text-muted-foreground">
              Khách chỉ nhìn thấy các phương thức được bật và được tài khoản merchant hỗ trợ.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {METHODS.map(([value, label, description]) => (
                <Label
                  key={value}
                  className="flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border bg-muted/15 p-4 font-normal transition-colors hover:bg-muted/35 has-data-[state=checked]:border-primary/35 has-data-[state=checked]:bg-primary/[0.035]"
                >
                  <Checkbox
                    name="enabledMethods"
                    value={value}
                    defaultChecked={settings.enabledMethods.includes(value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </Label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={readOnly || isSubmitting} className="space-y-3">
            <legend className="flex items-center gap-2 text-sm font-semibold">
              <RotateCcw className="size-4 text-primary" aria-hidden="true" /> Xử lý hoàn tiền
            </legend>
            <RadioGroup
              name="refundStrategy"
              value={refundStrategy}
              onValueChange={(value) =>
                setRefundStrategy(value as GatewayPaymentSettings['refundStrategy'])
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              <Label className="flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border bg-muted/15 p-4 font-normal transition-colors hover:bg-muted/35 has-data-[state=checked]:border-primary/35 has-data-[state=checked]:bg-primary/[0.035]">
                <RadioGroupItem value="manual" className="mt-0.5" />
                <span>
                  <strong className="text-sm">Xử lý thủ công</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Nhân viên chuyển tiền và xác nhận mã giao dịch sau khi hoàn tất.
                  </span>
                </span>
              </Label>
              <Label className="flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border bg-muted/15 p-4 font-normal transition-colors hover:bg-muted/35 has-data-[state=checked]:border-primary/35 has-data-[state=checked]:bg-primary/[0.035]">
                <RadioGroupItem value="automatic_preferred" className="mt-0.5" />
                <span>
                  <strong className="text-sm">Ưu tiên tự động</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Tự động hoàn các giao dịch đủ điều kiện; phần còn lại chuyển sang xử lý thủ
                    công.
                  </span>
                </span>
              </Label>
            </RadioGroup>
          </fieldset>

          <div className="max-w-sm space-y-2">
            <Label htmlFor="manualRefundSlaHours">Thời hạn xử lý thủ công</Label>
            <div className="relative">
              <Input
                id="manualRefundSlaHours"
                name="manualRefundSlaHours"
                type="number"
                min={1}
                max={720}
                defaultValue={settings.manualRefundSlaHours}
                disabled={readOnly || isSubmitting}
                className="pr-14 tabular-nums"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                giờ
              </span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Áp dụng cho mọi yêu cầu cần nhân viên chuyển tiền, kể cả khi đang ưu tiên tự động.
            </p>
          </div>

          <Button type="submit" size="control" disabled={readOnly || isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu phương thức thanh toán'}
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
