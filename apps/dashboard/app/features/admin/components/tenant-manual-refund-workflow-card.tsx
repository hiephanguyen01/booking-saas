import { useNavigation, useSubmit } from 'react-router';
import { AlertTriangle, CircleCheck, CircleX, PauseCircle, PlayCircle, ShieldCheck } from 'lucide-react';
import type { ManualRefundReadinessResponse } from '@booking/contracts';
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

const CHECK_LABELS: Record<string, string> = {
  pii_keyring: 'Keyring mã hoá PII',
  pii_active_key: 'Khóa PII kích hoạt',
  pii_fingerprint_key: 'Khóa băm PII fingerprint',
  private_storage: 'Lưu trữ tài liệu riêng tư',
  schema: 'Cơ sở dữ liệu & chỉ mục',
  system_role_permissions: 'Phân quyền hệ thống',
  worker_enabled: 'Outbox relay worker',
};

const REASON_LABELS: Record<string, string> = {
  missing_permissions: 'Thiếu quyền hạn trên vai trò hệ thống',
  missing_keyring: 'Chưa cấu hình keyring',
  invalid_keyring: 'Keyring không hợp lệ',
  invalid_keyring_keys: 'Khóa trong keyring không hợp lệ',
  empty_keyring: 'Keyring rỗng',
  missing_active_key: 'Chưa chỉ định phiên bản khóa kích hoạt',
  active_key_not_in_keyring: 'Phiên bản khóa kích hoạt không nằm trong keyring',
  missing_fingerprint_key: 'Chưa cấu hình khóa fingerprint',
  invalid_fingerprint_key: 'Khóa fingerprint không hợp lệ',
  fingerprint_key_matches_encryption_key: 'Khóa fingerprint trùng với khóa mã hoá',
  misconfigured_private_storage: 'Chưa cấu hình storage riêng tư',
  missing_schema: 'Thiếu bảng hoặc chỉ mục cơ sở dữ liệu',
  worker_disabled: 'Worker xử lý sự kiện đang bị tắt',
};

export function TenantManualRefundWorkflowCard({
  enabled: propEnabled,
  paused: propPaused,
  readiness,
  canEnable,
  busy,
  error,
}: {
  enabled: boolean;
  paused?: boolean;
  readiness: ManualRefundReadinessResponse | null;
  canEnable: boolean;
  busy: boolean;
  error: string | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy: guardedBusy, run } = useSubmissionGuard(navigation.state);
  const isBusy = busy || guardedBusy;

  const enabled = propEnabled || (readiness?.workflow.enabled ?? false);
  const paused = propPaused ?? (readiness?.workflow.paused ?? false);
  const isReady = readiness ? readiness.ready : true;
  const failingChecks = readiness?.checks.filter((c) => !c.ok) ?? [];

  return (
    <Card aria-busy={isBusy}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Manual Refund V2</CardTitle>
          <Badge variant={!enabled ? 'outline' : paused ? 'destructive' : 'success'}>
            {!enabled ? 'Chưa bật' : paused ? 'Đang tạm dừng' : 'Đang hoạt động'}
          </Badge>
        </div>
        <CardDescription>
          Quy trình hoàn tiền chuyển khoản theo batch với tài khoản nhận đã xác minh, maker và
          checker độc lập.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBanner error={error} />

        {failingChecks.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span>Chưa đạt điều kiện sẵn sàng vận hành (Preflight checks):</span>
            </div>
            <ul className="space-y-1 pl-6 list-disc text-muted-foreground">
              {failingChecks.map((check) => (
                <li key={check.key}>
                  <span className="font-medium text-foreground">
                    {CHECK_LABELS[check.key] ?? check.key}
                  </span>
                  :{' '}
                  {check.reason
                    ? REASON_LABELS[check.reason] ?? check.reason
                    : 'Không đạt yêu cầu'}
                </li>
              ))}
            </ul>
          </div>
        )}


        {enabled ? (
          <div className="space-y-3">
            {paused ? (
              <div className="flex items-start gap-3 text-sm" role="status">
                <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <p>
                  Workflow đang bị tạm dừng. Mọi thao tác chuyển tiền và truy cập PII đều bị chặn.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 text-sm" role="status">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <p>
                  Workflow đã được bật cho tenant này. Các batch hoàn thủ công được xử lý trong hàng đợi
                  tài chính của tenant.
                </p>
              </div>
            )}

            {canEnable && (
              <div className="pt-2">
                {paused ? (
                  <ConfirmButton
                    trigger={
                      <Button size="sm" disabled={isBusy || !isReady} variant="outline">
                        <PlayCircle className="size-4" aria-hidden="true" />
                        Tiếp tục workflow
                      </Button>
                    }
                    title="Tiếp tục Manual Refund V2?"
                    description="Khôi phục xử lý các hồ sơ hoàn tiền thủ công cho tenant. Đảm bảo các điều kiện an toàn và nhân sự đã sẵn sàng."
                    confirmLabel="Tiếp tục"
                    busy={isBusy}
                    onConfirm={() =>
                      run(() =>
                        submit(
                          {
                            intent: 'resume-manual-refund-v2',
                            reason: 'Tiếp tục quy trình sau khi kiểm tra an toàn',
                          },
                          { method: 'post' },
                        ),
                      )
                    }
                  />
                ) : (
                  <ConfirmButton
                    trigger={
                      <Button size="sm" disabled={isBusy} variant="outline" className="text-destructive">
                        <PauseCircle className="size-4" aria-hidden="true" />
                        Tạm dừng workflow
                      </Button>
                    }
                    title="Tạm dừng Manual Refund V2?"
                    description="Tạm dừng sẽ lập tức chặn tất cả thao tác hoàn tiền thủ công và truy cập PII cho đến khi được mở lại."
                    confirmLabel="Tạm dừng"
                    destructive
                    busy={isBusy}
                    onConfirm={() =>
                      run(() =>
                        submit(
                          {
                            intent: 'pause-manual-refund-v2',
                            reason: 'Tạm dừng quy trình theo lệnh quản trị viên',
                          },
                          { method: 'post' },
                        ),
                      )
                    }
                  />
                )}
              </div>
            )}
          </div>
        ) : canEnable ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bật workflow sẽ tạo hồ sơ cho các batch đang ở trạng thái manual_required. Thao tác
              này không tự chuyển tiền.
            </p>
            <ConfirmButton
              trigger={
                <Button size="sm" disabled={isBusy || !isReady}>
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
