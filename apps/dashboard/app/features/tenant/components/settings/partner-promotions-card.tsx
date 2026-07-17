import { useSubmit } from 'react-router';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Switch } from '@booking/ui/components/ui/switch';
import { CircleAlert } from 'lucide-react';
import { useBusy } from '~/hooks/use-busy';
import type { PartnerPromotionsState } from '~/features/tenant/lib/flags';

/**
 * Marketplace flag card — lets partners create their own promo codes (§12.2).
 * Submits `intent=toggle-partner-promos` to the settings route's action.
 */
export function PartnerPromotionsCard({
  state,
  readOnly,
  error,
}: {
  state: PartnerPromotionsState;
  readOnly: boolean;
  error: string | null;
}) {
  const submit = useSubmit();
  const busy = useBusy();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketplace</CardTitle>
        <CardDescription>
          Cho phép đối tác tự tạo mã khuyến mãi cho listing của họ (đối tác chịu chi phí, §12.2).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <CircleAlert className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {state.ok ? (
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">
              Đối tác được tạo khuyến mãi
              <span className="block text-muted-foreground">
                {state.enabled ? 'Đang bật' : 'Đang tắt'}
              </span>
            </span>
            <Switch
              checked={state.enabled}
              disabled={readOnly || busy}
              onCheckedChange={(checked) => {
                const fd = new FormData();
                fd.set('intent', 'toggle-partner-promos');
                fd.set('partnerPromotionsEnabled', checked ? 'true' : 'false');
                void submit(fd, { method: 'post' });
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
