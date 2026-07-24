import { useState } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import type { CancellationPolicyResponse } from '@booking/contracts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Separator } from '@booking/ui/components/ui/separator';
import { CancellationTiers } from '~/components/cancellation-tiers';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { CancellationPolicyForm } from '~/features/cancellation-policies/components/cancellation-policy-form';

const NONE = '__none__';

export function TenantDefaultCancellationPolicyCard({
  policies,
  readOnly,
  error,
  saved,
  loadError,
  manageError,
  manageFieldErrors,
  manageSuccess,
}: {
  policies: CancellationPolicyResponse[] | null;
  readOnly: boolean;
  error: string | null;
  saved: boolean;
  loadError: string | null;
  manageError: string | null;
  manageFieldErrors: Record<string, string[]> | null;
  manageSuccess: string | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy, run } = useSubmissionGuard(navigation.state);
  const current = policies?.find((policy) => policy.isDefault) ?? null;
  const [value, setValue] = useState(current?.id ?? NONE);
  const selected = policies?.find((policy) => policy.id === value) ?? null;
  const dirty = value !== (current?.id ?? NONE);

  const saveDefault = (): void => {
    const formData = new FormData();
    formData.set('intent', 'set-default-cancellation-policy');
    formData.set('policyId', value === NONE ? '' : value);
    run(() => submit(formData, { method: 'post' }));
  };

  const removePolicy = (policyId: string): void => {
    const formData = new FormData();
    formData.set('intent', 'delete-tenant-cancellation-policy');
    formData.set('policyId', policyId);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Card className="shadow-none" aria-busy={busy}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-4 text-primary" aria-hidden="true" /> Chính sách huỷ
            </CardTitle>
            <CardDescription className="mt-1.5">
              Tạo chính sách dùng chung và chọn quy tắc mặc định cho toàn bộ tenant.
            </CardDescription>
          </div>
          {!readOnly && policies ? (
            <PolicyDialog
              trigger={
                <Button type="button" size="sm" disabled={busy}>
                  <Plus className="size-4" /> Tạo chính sách
                </Button>
              }
              title="Tạo chính sách huỷ"
              description="Thêm các mốc hoàn tiền theo thời điểm khách huỷ trước lịch đặt."
            >
              <CancellationPolicyForm
                intent="create-tenant-cancellation-policy"
                serverError={manageError}
                fieldErrors={manageFieldErrors}
              />
            </PolicyDialog>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <ErrorBanner error={loadError ?? error ?? manageError} />
        <SuccessBanner message={saved ? 'Đã cập nhật chính sách huỷ mặc định.' : manageSuccess} />

        {!loadError && policies?.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-8 text-center">
            <p className="text-sm font-semibold">Chưa có chính sách huỷ cấp tổ chức</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Tạo chính sách đầu tiên để mọi đối tác có thể dùng chung một bộ quy tắc hoàn tiền rõ
              ràng.
            </p>
          </div>
        ) : loadError || !policies ? null : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tenant-default-cancellation-policy">
                Chính sách mặc định
              </label>
              <Select value={value} onValueChange={setValue} disabled={readOnly || busy}>
                <SelectTrigger id="tenant-default-cancellation-policy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Không đặt mặc định</SelectItem>
                  {policies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">
                Chỉ dùng khi tin đăng và đối tác đều chưa chọn chính sách riêng.
              </p>
            </div>
            {selected ? (
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="mb-3 text-xs font-semibold text-muted-foreground">
                  Các mốc hoàn tiền
                </p>
                <CancellationTiers rules={selected.rules} />
              </div>
            ) : null}
            <Button
              type="button"
              size="control"
              disabled={readOnly || busy || !dirty}
              onClick={saveDefault}
            >
              Lưu chính sách mặc định
            </Button>

            <Separator />

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Chính sách cấp tổ chức</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Các chính sách này được chia sẻ cho mọi đối tác trong tenant.
                </p>
              </div>
              <ul className="space-y-3">
                {policies.map((policy) => (
                  <PolicyRow
                    key={policy.id}
                    policy={policy}
                    readOnly={readOnly}
                    busy={busy}
                    manageError={manageError}
                    manageFieldErrors={manageFieldErrors}
                    onRemove={() => removePolicy(policy.id)}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PolicyRow({
  policy,
  readOnly,
  busy,
  manageError,
  manageFieldErrors,
  onRemove,
}: {
  policy: CancellationPolicyResponse;
  readOnly: boolean;
  busy: boolean;
  manageError: string | null;
  manageFieldErrors: Record<string, string[]> | null;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-xl border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{policy.name}</p>
            {policy.isDefault ? <Badge variant="secondary">Mặc định</Badge> : null}
          </div>
          <div className="mt-3">
            <CancellationTiers rules={policy.rules} />
          </div>
        </div>
        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1">
            <PolicyDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" disabled={busy}>
                  <Pencil className="size-3.5" /> Sửa
                </Button>
              }
              title={`Sửa ${policy.name}`}
              description="Thay đổi này áp dụng cho các lượt đặt sử dụng chính sách sau khi lưu."
            >
              <CancellationPolicyForm
                policy={policy}
                intent="update-tenant-cancellation-policy"
                serverError={manageError}
                fieldErrors={manageFieldErrors}
              />
            </PolicyDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  aria-label={`Xoá ${policy.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xoá chính sách {policy.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Không thể xoá nếu một tin đăng vẫn đang tham chiếu trực tiếp tới chính sách này.
                    Nếu đây là chính sách mặc định, tenant sẽ trở về trạng thái chưa chọn mặc định.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Giữ lại</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onRemove} disabled={busy}>
                    Xoá chính sách
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function PolicyDialog({
  trigger,
  title,
  description,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
