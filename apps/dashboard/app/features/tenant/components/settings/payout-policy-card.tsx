import * as React from 'react';
import { Form } from 'react-router';
import type { PayoutPolicyDto } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';

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
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Giữ tiền & chi trả Partner</CardTitle>
        <CardDescription>
          Khoảng chờ tranh chấp được tính từ lúc Partner xác nhận hoàn thành. Chỉ khoản đã release mới vào kỳ chi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="intent" value="payout-policy" />
          <div className="space-y-2">
            <Label htmlFor="holdingDays">Số ngày tranh chấp</Label>
            <Input id="holdingDays" name="holdingDays" type="number" min={0} max={90} defaultValue={policy.holdingDays} required disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minAmount">Payout tối thiểu (VND)</Label>
            <Input id="minAmount" name="minAmount" inputMode="numeric" pattern="\d*" defaultValue={policy.minAmount} required disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cycle">Chu kỳ mặc định</Label>
            <NativeSelect id="cycle" name="cycle" defaultValue={policy.cycle} disabled={readOnly}>
              <NativeSelectOption value="weekly">Hàng tuần</NativeSelectOption>
              <NativeSelectOption value="monthly">Hàng tháng</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" disabled={readOnly}>Lưu chính sách chi trả</Button>
            {saved ? <span className="text-sm text-emerald-600">Đã lưu.</span> : null}
            {error ? <span className="text-sm text-destructive">{error}</span> : null}
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}
