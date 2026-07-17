import { useSubmit } from 'react-router';
import { PauseCircle, PlayCircle } from 'lucide-react';
import type { TenantDetailResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { ConfirmButton } from '~/components/confirm-button';
import { ErrorBanner } from '~/components/action-feedback';

/**
 * "Vùng nguy hiểm" card: suspend/reactivate the tenant behind a confirm dialog.
 * The confirm posts `intent=set-status` FormData via `useSubmit` — same payload
 * as the previous hidden-field `<Form>`.
 */
export function TenantDangerSection({
  status,
  busy,
  error,
}: {
  status: TenantDetailResponse['status'];
  busy: boolean;
  error: string | null;
}) {
  const submit = useSubmit();
  const suspend = status === 'active';
  const nextStatus = suspend ? 'suspended' : 'active';

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Vùng nguy hiểm</CardTitle>
        <CardDescription>
          {suspend
            ? 'Tạm ngưng sẽ đưa storefront của tenant xuống ngay lập tức.'
            : 'Kích hoạt lại để đưa storefront của tenant hoạt động trở lại.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ErrorBanner error={error} />
        <ConfirmButton
          trigger={
            <Button variant={suspend ? 'destructive' : 'default'} size="sm" disabled={busy}>
              {suspend ? (
                <>
                  <PauseCircle className="size-4" />
                  Tạm ngưng tenant
                </>
              ) : (
                <>
                  <PlayCircle className="size-4" />
                  Kích hoạt tenant
                </>
              )}
            </Button>
          }
          title={suspend ? 'Tạm ngưng tenant?' : 'Kích hoạt tenant?'}
          description={
            suspend
              ? 'Storefront sẽ ngừng nhận đơn ngay khi tạm ngưng. Bạn có thể kích hoạt lại bất cứ lúc nào.'
              : 'Storefront sẽ hoạt động trở lại và tiếp tục nhận đơn.'
          }
          confirmLabel={suspend ? 'Tạm ngưng' : 'Kích hoạt'}
          destructive={suspend}
          busy={busy}
          onConfirm={() => void submit({ intent: 'set-status', status: nextStatus }, { method: 'post' })}
        />
      </CardContent>
    </Card>
  );
}
