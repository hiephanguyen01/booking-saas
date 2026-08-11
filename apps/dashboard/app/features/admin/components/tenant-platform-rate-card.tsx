import { Form } from 'react-router';
import { Percent } from 'lucide-react';
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
import { ErrorBanner } from '~/components/action-feedback';

/**
 * Platform fee % for one tenant — the platform's cut of every booking.
 *
 * The copy states that it applies to every rule, because an admin who assumes it
 * only edits the default would silently under-bill every overridden partner. It
 * also states that existing bookings do not move, since that is the first thing
 * anyone asks before changing a live fee.
 */
export function TenantPlatformRateCard({
  platformRate,
  busy,
  error,
}: {
  platformRate: number | null;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Card aria-busy={busy}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="size-4 text-muted-foreground" />
          Phí nền tảng
        </CardTitle>
        <CardDescription>
          Phần trăm nền tảng thu trên mỗi booking của tenant này. Áp dụng cho tất cả quy tắc hoa
          hồng, kể cả quy tắc riêng theo partner hoặc loại dịch vụ. Booking đã tạo không đổi — mỗi
          booking dùng mức phí đã đóng băng lúc đặt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ErrorBanner error={error} />
        {platformRate === null ? (
          <p className="text-sm text-muted-foreground">
            Tenant chưa có quy tắc hoa hồng nào nên chưa đặt được phí nền tảng.
          </p>
        ) : (
          <Form method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="set-platform-rate" />
            <div className="grid gap-1.5">
              <Label htmlFor="platformRate">Phí nền tảng (%)</Label>
              <Input
                id="platformRate"
                name="platformRate"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={platformRate}
                className="w-28"
              />
            </div>
            <Button type="submit" size="sm" disabled={busy}>
              Lưu
            </Button>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
