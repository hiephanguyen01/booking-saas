import type { FormEvent } from 'react';
import type { PayoutPolicyDto } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { HandCoins } from 'lucide-react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { formatVnd } from '~/lib/format';

export function PayoutPolicyCard({
  policy,
  readOnly,
  saved,
  error,
}: {
  policy: PayoutPolicyDto;
  readOnly: boolean;
  saved: boolean;
  error: string | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy: isSubmitting, run } = useSubmissionGuard(navigation.state);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Card className="shadow-none" aria-busy={isSubmitting}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="size-4 text-primary" aria-hidden="true" /> Giữ tiền và chi trả đối
          tác
        </CardTitle>
        <CardDescription>
          Khoảng chờ tranh chấp bắt đầu khi đối tác xác nhận hoàn thành. Chỉ khoản đã được giải
          phóng mới đi vào kỳ chi trả.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ErrorBanner error={error} />
        <SuccessBanner message={saved ? 'Đã cập nhật chính sách chi trả đối tác.' : null} />

        <div className="rounded-xl border bg-primary/[0.035] p-4 text-sm leading-6">
          Theo cấu hình hiện tại, khoản tiền được giữ <strong>{policy.holdingDays} ngày</strong> và
          được đưa vào kỳ chi{' '}
          <strong>{policy.cycle === 'weekly' ? 'hàng tuần' : 'hàng tháng'}</strong> khi số dư đạt ít
          nhất <strong>{formatVnd(policy.minAmount)}</strong>.
        </div>

        <Form method="post" className="space-y-5" onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value="payout-policy" />
          <fieldset
            disabled={readOnly || isSubmitting}
            className="grid gap-5 rounded-xl border bg-muted/20 p-4 sm:p-5 md:grid-cols-3"
          >
            <div className="space-y-2">
              <Label htmlFor="holdingDays">Thời gian giữ tiền</Label>
              <div className="relative">
                <Input
                  id="holdingDays"
                  name="holdingDays"
                  type="number"
                  min={0}
                  max={90}
                  defaultValue={policy.holdingDays}
                  required
                  className="pr-14 tabular-nums"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ngày
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">Từ 0 đến 90 ngày.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minAmount">Mức chi tối thiểu</Label>
              <div className="relative">
                <Input
                  id="minAmount"
                  name="minAmount"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  defaultValue={policy.minAmount}
                  required
                  className="pr-12 tabular-nums"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  VND
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Hiện tại: {formatVnd(policy.minAmount)}.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle">Chu kỳ mặc định</Label>
              <Select name="cycle" defaultValue={policy.cycle}>
                <SelectTrigger id="cycle" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Hàng tuần</SelectItem>
                  <SelectItem value="monthly">Hàng tháng</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">
                Áp dụng cho các khoản đã qua thời gian giữ tiền.
              </p>
            </div>
          </fieldset>

          <Button type="submit" size="control" disabled={readOnly || isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu chính sách chi trả'}
          </Button>
          {readOnly ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Bạn đang ở chế độ chỉ đọc hoặc không có quyền quản lý chi trả.
            </p>
          ) : null}
        </Form>
      </CardContent>
    </Card>
  );
}
