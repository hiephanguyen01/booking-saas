import { useState } from 'react';
import { useSubmit } from 'react-router';
import { CircleAlert } from 'lucide-react';
import type { CancellationPolicyResponse } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { CancellationTiers } from '~/components/cancellation-tiers';
import { useBusy } from '~/hooks/use-busy';

// Radix Select forbids an empty-string item value, so "no default" needs a sentinel.
const NONE = '__none__';

/**
 * Tenant-level fallback cancellation policy (§11.3) — the last resort when neither a
 * listing nor its partner sets one. Submits `intent=set-default-cancellation-policy`.
 */
export function TenantDefaultCancellationPolicyCard({
  policies,
  readOnly,
  error,
  saved,
}: {
  policies: CancellationPolicyResponse[];
  readOnly: boolean;
  error: string | null;
  saved: boolean;
}) {
  const submit = useSubmit();
  const busy = useBusy();
  const current = policies.find((p) => p.isDefault) ?? null;
  const [value, setValue] = useState(current?.id ?? NONE);
  const selected = policies.find((p) => p.id === value) ?? null;
  const dirty = value !== (current?.id ?? NONE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chính sách huỷ mặc định</CardTitle>
        <CardDescription>
          Áp dụng cho lượt đặt khi cả tin đăng lẫn đối tác của nó đều chưa đặt chính sách huỷ riêng.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {saved ? <p className="text-sm text-muted-foreground">Đã lưu.</p> : null}
        {policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có chính sách huỷ chung nào ở cấp tổ chức để chọn.
          </p>
        ) : (
          <>
            <Select value={value} onValueChange={setValue} disabled={readOnly || busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Không đặt mặc định</SelectItem>
                {policies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? <CancellationTiers rules={selected.rules} /> : null}
            <Button
              type="button"
              size="sm"
              disabled={readOnly || busy || !dirty}
              onClick={() => {
                const fd = new FormData();
                fd.set('intent', 'set-default-cancellation-policy');
                fd.set('policyId', value === NONE ? '' : value);
                void submit(fd, { method: 'post' });
              }}
            >
              Lưu
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
