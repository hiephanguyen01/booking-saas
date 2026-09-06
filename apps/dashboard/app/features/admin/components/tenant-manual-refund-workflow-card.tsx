import { useNavigation, useSubmit } from 'react-router';
import { CircleCheck, ShieldCheck } from 'lucide-react';
import { Badge } from '@booking/ui/components/ui/badge';
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
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

export function TenantManualRefundWorkflowCard({
  enabled,
  canEnable,
  busy,
  error,
}: {
  enabled: boolean;
  canEnable: boolean;
  busy: boolean;
  error: string | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy: guardedBusy, run } = useSubmissionGuard(navigation.state);
  const isBusy = busy || guardedBusy;

  return (
    <Card aria-busy={isBusy}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Manual Refund V2</CardTitle>
          <Badge variant={enabled ? 'success' : 'outline'}>
            {enabled ? 'Đang hoạt động' : 'Chưa bật'}
          </Badge>
        </div>
        <CardDescription>
          Quy trình hoàn tiền chuyển khoản theo batch với tài khoản nhận đã xác minh, maker và
          checker độc lập.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBanner error={error} />

        {enabled ? (
          <div className="flex items-start gap-3 text-sm" role="status">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <p>
              Workflow đã được bật cho tenant này. Các batch hoàn thủ công được xử lý trong hàng đợi
              tài chính của tenant.
            </p>
          </div>
        ) : canEnable ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bật workflow sẽ tạo hồ sơ cho các batch đang ở trạng thái manual_required. Thao tác
              này không tự chuyển tiền.
            </p>
            <ConfirmButton
              trigger={
                <Button size="sm" disabled={isBusy}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Bật Manual Refund V2
                </Button>
              }
              title="Bật Manual Refund V2?"
              description="Các batch manual_required chưa có hồ sơ sẽ được đưa vào hàng đợi chờ khách khai báo tài khoản và phát thông báo yêu cầu bổ sung thông tin. Thao tác không tự hoàn tiền và không thể tắt từ màn hình này."
              confirmLabel="Bật workflow"
              busy={isBusy}
              onConfirm={() =>
                run(() => submit({ intent: 'enable-manual-refund-v2' }, { method: 'post' }))
              }
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bạn cần quyền quản lý tenant để bật workflow này.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
