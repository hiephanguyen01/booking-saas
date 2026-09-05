import { manualRefundBreakGlassInputSchema, uuidSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Siren } from 'lucide-react';

export const manualRefundBreakGlassFormSchema = manualRefundBreakGlassInputSchema.extend({
  tenantId: uuidSchema,
  operationId: uuidSchema,
});

export function ManualRefundBreakGlassPanel({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Siren className="size-5" /> Break-glass hoàn tiền
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Chỉ dùng khi không thể bố trí checker độc lập. Phiên đăng nhập phải được xác thực lại trong
          5 phút; lý do và danh tính người thực hiện sẽ được audit ở mức cảnh báo cao.
        </p>
      </CardHeader>
      <CardContent>
        {success ? <p className="mb-4 text-sm text-success" role="status">{success}</p> : null}
        <GenericForm
          schema={manualRefundBreakGlassFormSchema}
          columns={2}
          fields={[
            { name: 'tenantId', type: 'text', label: 'Mã tenant', required: true },
            { name: 'operationId', type: 'text', label: 'Mã operation hoàn tiền', required: true },
            { name: 'expectedVersion', type: 'number', label: 'Phiên bản operation hiện tại', required: true, min: 1 },
            { name: 'reason', type: 'textarea', rows: 3, label: 'Lý do khẩn cấp', required: true, colSpan: 2 },
          ]}
          defaultValues={{ tenantId: '', operationId: '', expectedVersion: 1, reason: '', confirmation: 'BREAK_GLASS' }}
          transform={(values) => ({ ...values, intent: 'break-glass' })}
          submitLabel="Hoàn tất bằng break-glass"
          submitPendingLabel="Đang kiểm tra phiên và bằng chứng…"
          serverError={error}
        />
      </CardContent>
    </Card>
  );
}
