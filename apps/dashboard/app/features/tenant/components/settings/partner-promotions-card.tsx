import { useNavigation, useSubmit } from 'react-router';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Switch } from '@booking/ui/components/ui/switch';
import { CircleAlert, Megaphone } from 'lucide-react';
import type { PartnerPromotionsState } from '~/features/tenant/lib/flags';
import { SuccessBanner } from '~/components/action-feedback';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

/**
 * Marketplace flag card: lets partners create their own promo codes (§12.2).
 * Submits `intent=toggle-partner-promos` to the settings route's action.
 */
export function PartnerPromotionsCard({
  state,
  readOnly,
  error,
  saved,
}: {
  state: PartnerPromotionsState;
  readOnly: boolean;
  error: string | null;
  saved: boolean;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy, run } = useSubmissionGuard(navigation.state);

  return (
    <Card className="shadow-none" aria-busy={busy}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" aria-hidden="true" /> Khuyến mãi của đối tác
        </CardTitle>
        <CardDescription>
          Cho phép đối tác tự tạo mã giảm giá cho tin đăng của họ. Phần giảm giá do đối tác chịu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <CircleAlert className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <SuccessBanner message={saved ? 'Đã cập nhật quyền tạo khuyến mãi của đối tác.' : null} />
        {state.ok ? (
          <label className="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
            <span className="text-sm">
              <span className="font-semibold">Đối tác được tự tạo mã giảm giá</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {state.enabled
                  ? 'Đang bật. Đối tác có thể tạo và quản lý khuyến mãi của riêng họ.'
                  : 'Đang tắt. Chỉ tenant có thể quản lý chương trình khuyến mãi.'}
              </span>
            </span>
            <Switch
              checked={state.enabled}
              disabled={readOnly || busy}
              onCheckedChange={(checked) => {
                const formData = new FormData();
                formData.set('intent', 'toggle-partner-promos');
                formData.set('partnerPromotionsEnabled', checked ? 'true' : 'false');
                run(() => submit(formData, { method: 'post' }));
              }}
            />
          </label>
        ) : (
          // No Switch at all on a failed read: any rendered toggle would have to
          // pick a checked state, and picking one would state a setting we do
          // not actually know.
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
