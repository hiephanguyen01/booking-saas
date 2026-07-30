import type { FormEvent } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type { CommissionRuleResponse, PartnerResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { ArrowRight, Percent, RotateCcw } from 'lucide-react';
import { RateFields } from '~/features/tenant/components/finance/commission-rules-panel';

export function PartnerCommissionCard({
  partner,
  defaultRule,
  partnerRule,
  readOnly,
}: {
  partner: PartnerResponse;
  defaultRule: CommissionRuleResponse | null;
  partnerRule: CommissionRuleResponse | null;
  readOnly: boolean;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const effective = partnerRule ?? defaultRule;

  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit(new FormData(event.currentTarget), { method: 'post' });
  };

  const reset = (): void => {
    if (!partnerRule) return;
    const form = new FormData();
    form.set('intent', 'delete-partner-commission');
    form.set('ruleId', partnerRule.id);
    submit(form, { method: 'post' });
  };

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Percent className="size-4 text-primary" /> Hoa hồng
            </CardTitle>
            <CardDescription className="mt-1.5">
              Cấu hình nhanh phần tenant thu riêng cho {partner.name}.
            </CardDescription>
          </div>
          <Badge variant={partnerRule ? 'default' : 'secondary'}>
            {partnerRule ? 'Mức riêng' : 'Đang dùng mặc định'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        {!effective ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-6">
            <p className="text-sm font-semibold">Chưa có mức hoa hồng mặc định</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Hệ thống đang provision mức mặc định cho tenant. Tải lại trang sau ít giây.
            </p>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-5" aria-busy={busy}>
            <input
              type="hidden"
              name="intent"
              value={partnerRule ? 'update-partner-commission' : 'create-partner-commission'}
            />
            {partnerRule ? <input type="hidden" name="ruleId" value={partnerRule.id} /> : null}
            <input type="hidden" name="appliesTo" value="partner" />
            <input type="hidden" name="targetId" value={partner.id} />

            <div className="grid gap-4 lg:grid-cols-[1fr_auto_240px] lg:items-center">
              <div className="rounded-xl border bg-muted/20 p-4">
                <RateFields
                  key={effective.id}
                  rule={effective}
                  platformRate={effective.platformRate}
                />
              </div>
              <ArrowRight className="mx-auto hidden size-4 text-muted-foreground lg:block" />
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Đối tác dự kiến nhận</p>
                <p className="mt-1 text-2xl font-bold">
                  {effective.tenantRateType === 'percent'
                    ? `${Math.max(0, 100 - Number(effective.tenantRate))}%`
                    : 'Giá bán − phí cố định'}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Tính trước giảm giá và các điều chỉnh phát sinh của booking.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="control" disabled={readOnly || busy}>
                {partnerRule ? 'Lưu mức riêng' : 'Tạo mức riêng cho đối tác'}
              </Button>
              {partnerRule ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="control"
                  disabled={readOnly || busy}
                  onClick={reset}
                >
                  <RotateCcw className="size-4" /> Dùng lại mức mặc định
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
