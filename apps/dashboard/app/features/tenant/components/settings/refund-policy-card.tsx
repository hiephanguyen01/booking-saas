import { useState, type FormEvent } from 'react';
import type { TenantRefundPolicy } from '@booking/contracts';
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
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { RotateCcw } from 'lucide-react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

export function RefundPolicyCard({
  policy,
  readOnly,
  error,
  success,
}: {
  policy: TenantRefundPolicy;
  readOnly: boolean;
  error: string | null;
  success: boolean;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy: isSubmitting, run } = useSubmissionGuard(navigation.state);
  const [refundStrategy, setRefundStrategy] = useState(policy.refundStrategy);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Card className="shadow-none" aria-busy={isSubmitting}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="size-4 text-primary" aria-hidden="true" /> Chính sách hoàn tiền
        </CardTitle>
        <CardDescription>
          Chính sách này được chụp vào từng Payment mới, nên thay đổi sau này không làm đổi cách xử
          lý các giao dịch đã tạo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-6" onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value="refund-policy" />
          <ErrorBanner error={error} />
          <SuccessBanner message={success ? 'Đã lưu chính sách hoàn tiền.' : null} />

          <fieldset disabled={readOnly || isSubmitting} className="space-y-3">
            <legend className="text-sm font-semibold">Cách xử lý</legend>
            <RadioGroup
              name="refundStrategy"
              value={refundStrategy}
              onValueChange={(value) =>
                setRefundStrategy(value as TenantRefundPolicy['refundStrategy'])
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              <Label className="flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border bg-muted/15 p-4 font-normal transition-colors hover:bg-muted/35 has-data-[state=checked]:border-primary/35 has-data-[state=checked]:bg-primary/[0.035]">
                <RadioGroupItem value="manual" className="mt-0.5" />
                <span>
                  <strong className="text-sm">Xử lý thủ công</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Nhân viên chuyển tiền và xác nhận sau khi hoàn tất.
                  </span>
                </span>
              </Label>
              <Label className="flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border bg-muted/15 p-4 font-normal transition-colors hover:bg-muted/35 has-data-[state=checked]:border-primary/35 has-data-[state=checked]:bg-primary/[0.035]">
                <RadioGroupItem value="automatic_preferred" className="mt-0.5" />
                <span>
                  <strong className="text-sm">Ưu tiên tự động</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Tự động hoàn khi provider hỗ trợ; trường hợp không hỗ trợ chuyển sang thủ công.
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
                defaultValue={policy.manualRefundSlaHours}
                disabled={readOnly || isSubmitting}
                className="pr-14 tabular-nums"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                giờ
              </span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Áp dụng khi hoàn tiền cần nhân viên xử lý thủ công.
            </p>
          </div>

          <Button type="submit" size="control" disabled={readOnly || isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu chính sách hoàn tiền'}
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
