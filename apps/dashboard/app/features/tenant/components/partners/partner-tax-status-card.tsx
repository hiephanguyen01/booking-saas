import { useSubmit, useNavigation } from 'react-router';
import type { PartnerResponse, PartnerTaxStatus } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Label } from '@booking/ui/components/ui/label';
import { Input } from '@booking/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { useState } from 'react';
import { ErrorBanner } from '~/components/action-feedback';
import { PARTNER_TAX_STATUS_LABELS, PARTNER_TAX_STATUS_HINTS } from '~/constants/tax';

/**
 * The partner's tax status — the single field that decides which VAT regime
 * their bookings are billed under, and later whether their payout is withheld
 * from. Misclassifying a partner silently mis-taxes every booking they take,
 * which is why each option carries its consequence rather than just a name.
 *
 * Existing bookings never move: each replays the rate frozen on its snapshot.
 */
export function PartnerTaxStatusCard({
  taxStatus,
  busy,
  error,
}: {
  taxStatus: PartnerResponse['taxStatus'];
  busy: boolean;
  error: string | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [value, setValue] = useState<PartnerTaxStatus>(taxStatus);
  const [reason, setReason] = useState('');
  const pending = busy || navigation.state === 'submitting';
  const dirty = value !== taxStatus;

  return (
    <Card aria-busy={pending}>
      <CardHeader>
        <CardTitle>Điều chỉnh thủ công</CardTitle>
        <CardDescription>
          Chỉ dùng khi hồ sơ pháp lý cần ghi đè kết quả tự động. Điều chỉnh hết hạn vào cuối năm;
          booking đã đặt vẫn giữ snapshot cũ.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ErrorBanner error={error} />
        <div className="grid gap-1.5">
          <Label htmlFor="partner-tax-status">Diện thuế</Label>
          <Select value={value} onValueChange={(v) => setValue(v as PartnerTaxStatus)}>
            <SelectTrigger id="partner-tax-status" className="w-full sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PARTNER_TAX_STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">
            {PARTNER_TAX_STATUS_HINTS[value]}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="partner-tax-override-reason">Lý do điều chỉnh</Label>
          <Input
            id="partner-tax-override-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={500}
            placeholder="Ví dụ: hồ sơ cơ quan thuế xác nhận diện kê khai"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !dirty || reason.trim().length < 3}
          onClick={() =>
            submit(
              { intent: 'set-tax-status', taxStatus: value, reason: reason.trim() },
              { method: 'post' },
            )
          }
        >
          Lưu
        </Button>
      </CardContent>
    </Card>
  );
}
