import { useSubmit } from 'react-router';
import type {
  CommissionRuleResponse,
} from '@booking/contracts';
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
import { ArrowRight, Building2, Pencil, Percent, Plus, Trash2, Users } from 'lucide-react';
import { COMMISSION_SCOPE_LABEL } from '~/constants/finance';
import {
  formatRate,
  targetLabel,
  type CommissionTargetOptions,
} from '~/features/tenant/lib/commission-rules';
import { RuleDialog } from '~/features/tenant/components/finance/commission-rule-dialog';

export function CommissionRulesPanel({
  rules,
  targets,
  readOnly,
}: {
  rules: CommissionRuleResponse[];
  targets: CommissionTargetOptions;
  readOnly: boolean;
}) {
  const defaultRule = rules.find((rule) => rule.appliesTo === 'tenant_default') ?? null;
  const overrides = rules.filter((rule) => rule.appliesTo !== 'tenant_default');
  const hasTargets =
    targets.partners.length + targets.listingTypes.length + targets.categories.length > 0;

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Percent className="size-4 text-primary" /> Quy tắc hoa hồng
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-2xl leading-6">
              Tenant thu phí dịch vụ từ doanh thu của đối tác. Quy tắc riêng sẽ ưu tiên hơn mức mặc
              định và chỉ áp dụng cho lượt đặt mới.
            </CardDescription>
          </div>
          <RuleDialog
            mode="create"
            targets={targets}
            disabled={readOnly || !hasTargets || !defaultRule}
            trigger={
              <Button type="button" size="sm" disabled={readOnly || !hasTargets || !defaultRule}>
                <Plus className="size-4" /> Thêm quy tắc riêng
              </Button>
            }
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-7 p-5 sm:p-6">
        {defaultRule ? (
          <DefaultRule rule={defaultRule} targets={targets} readOnly={readOnly} />
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-7">
            <p className="font-semibold">Đang khởi tạo mức hoa hồng mặc định</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Tenant mới sẽ được provision tự động. Nếu vừa tạo tenant, tải lại trang sau ít giây.
            </p>
          </div>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Quy tắc riêng</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Ưu tiên theo đối tác trước, sau đó đến loại dịch vụ hoặc danh mục.
              </p>
            </div>
            <Badge variant="secondary">{overrides.length} quy tắc</Badge>
          </div>

          {overrides.length === 0 ? (
            <div className="rounded-xl border border-dashed px-5 py-8 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                <Users className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-semibold">Chưa cần ngoại lệ</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                Toàn bộ đối tác đang dùng mức mặc định. Chỉ thêm quy tắc khi một nhóm cần tỷ lệ
                khác.
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {overrides.map((rule) => (
                <OverrideRow key={rule.id} rule={rule} targets={targets} readOnly={readOnly} />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function DefaultRule({
  rule,
  targets,
  readOnly,
}: {
  rule: CommissionRuleResponse;
  targets: CommissionTargetOptions;
  readOnly: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-4" />
            </div>
            <div>
              <p className="font-semibold">Mức mặc định toàn tenant</p>
              <p className="text-xs text-muted-foreground">
                Dùng khi không có quy tắc riêng phù hợp.
              </p>
            </div>
          </div>
        </div>
        <RuleDialog
          mode="edit"
          rule={rule}
          targets={targets}
          disabled={readOnly}
          trigger={
            <Button type="button" variant="outline" size="sm" disabled={readOnly}>
              <Pencil className="size-3.5" /> Điều chỉnh
            </Button>
          }
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <RateMetric
          label="Tenant thu từ đối tác"
          value={formatRate(rule.tenantRateType, rule.tenantRate)}
        />
        <ArrowRight className="mx-auto hidden size-4 text-muted-foreground sm:block" />
        <RateMetric label="Phí nền tảng" value={`${rule.platformRate}%`} muted />
        <ArrowRight className="mx-auto hidden size-4 text-muted-foreground sm:block" />
        <RateMetric
          label="Hoa hồng cộng tác viên"
          value={formatRate(rule.affiliateRateType, rule.affiliateRate)}
          muted
        />
      </div>
      <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
        Phí nền tảng và hoa hồng cộng tác viên được trừ trong phần tenant thu; phần còn lại là doanh
        thu ròng của tenant.
      </p>
    </section>
  );
}

function RateMetric({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          muted
            ? 'mt-1 text-xl font-semibold text-foreground'
            : 'mt-1 text-xl font-bold text-primary'
        }
      >
        {value}
      </p>
    </div>
  );
}

function OverrideRow({
  rule,
  targets,
  readOnly,
}: {
  rule: CommissionRuleResponse;
  targets: CommissionTargetOptions;
  readOnly: boolean;
}) {
  const submit = useSubmit();
  const target = targetLabel(rule, targets);

  const remove = (): void => {
    const form = new FormData();
    form.set('intent', 'delete-commission-rule');
    form.set('ruleId', rule.id);
    submit(form, { method: 'post' });
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{COMMISSION_SCOPE_LABEL[rule.appliesTo]}</Badge>
          <p className="truncate text-sm font-semibold">{target}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            Tenant thu{' '}
            <strong className="font-semibold text-foreground">
              {formatRate(rule.tenantRateType, rule.tenantRate)}
            </strong>
          </span>
          <span>
            CTV{' '}
            <strong className="font-semibold text-foreground">
              {formatRate(rule.affiliateRateType, rule.affiliateRate)}
            </strong>
          </span>
          <span>Nền tảng {rule.platformRate}%</span>
        </div>
      </div>
      {!readOnly ? (
        <div className="flex shrink-0 items-center gap-1">
          <RuleDialog
            mode="edit"
            rule={rule}
            targets={targets}
            trigger={
              <Button type="button" variant="ghost" size="sm">
                <Pencil className="size-3.5" /> Sửa
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Xoá quy tắc ${target}`}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Xoá quy tắc riêng?</AlertDialogTitle>
                <AlertDialogDescription>
                  {target} sẽ quay lại dùng mức hoa hồng mặc định. Booking đã tạo không thay đổi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Giữ lại</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={remove}>
                  Xoá
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}
