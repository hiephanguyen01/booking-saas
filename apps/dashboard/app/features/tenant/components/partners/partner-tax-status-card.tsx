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
  const pending = busy || navigation.state === 'submitting';
  const dirty = value !== taxStatus;

  return (
    <Card aria-busy={pending}>
      <CardHeader>
        <CardTitle>Hồ sơ thuế</CardTitle>
        <CardDescription>
          Quyết định thuế suất GTGT áp cho mọi booking của đối tác này. Booking đã đặt không đổi —
          mỗi booking giữ mức thuế đã đóng băng lúc đặt.
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
        <Button
          type="button"
          size="sm"
          disabled={pending || !dirty}
          onClick={() => submit({ intent: 'set-tax-status', taxStatus: value }, { method: 'post' })}
        >
          Lưu
        </Button>
      </CardContent>
    </Card>
  );
}
