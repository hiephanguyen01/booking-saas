import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type {
  CommissionAppliesToDto,
  CommissionRuleResponse,
  RateTypeDto,
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { ArrowRight, Building2, Pencil, Percent, Plus, Trash2, Users } from 'lucide-react';

export interface CommissionTargetOption {
  id: string;
  label: string;
}

export interface CommissionTargetOptions {
  partners: CommissionTargetOption[];
  listingTypes: CommissionTargetOption[];
  categories: CommissionTargetOption[];
}

const SCOPE_LABEL: Record<CommissionAppliesToDto, string> = {
  tenant_default: 'Mặc định toàn tenant',
  partner: 'Đối tác',
  listing_type: 'Loại dịch vụ',
  category: 'Danh mục',
};

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
          <Badge variant="outline">{SCOPE_LABEL[rule.appliesTo]}</Badge>
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

function RuleDialog({
  mode,
  rule,
  targets,
  trigger,
  disabled = false,
}: {
  mode: 'create' | 'edit';
  rule?: CommissionRuleResponse;
  targets: CommissionTargetOptions;
  trigger: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Exclude<CommissionAppliesToDto, 'tenant_default'>>(
    rule?.appliesTo === 'partner' ||
      rule?.appliesTo === 'listing_type' ||
      rule?.appliesTo === 'category'
      ? rule.appliesTo
      : firstAvailableScope(targets),
  );
  const [targetId, setTargetId] = useState(rule ? ruleTargetId(rule) : '');
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const isDefault = rule?.appliesTo === 'tenant_default';

  const onScopeChange = (value: Exclude<CommissionAppliesToDto, 'tenant_default'>): void => {
    setScope(value);
    setTargetId('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit(new FormData(event.currentTarget), { method: 'post' });
    if (mode === 'create') setTargetId('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="hidden"
            name="intent"
            value={mode === 'create' ? 'create-commission-rule' : 'update-commission-rule'}
          />
          {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
          <input type="hidden" name="appliesTo" value={isDefault ? 'tenant_default' : scope} />
          {!isDefault ? <input type="hidden" name="targetId" value={targetId} /> : null}

          <DialogHeader>
            <DialogTitle>
              {isDefault
                ? 'Điều chỉnh mức hoa hồng mặc định'
                : mode === 'create'
                  ? 'Thêm quy tắc hoa hồng riêng'
                  : `Sửa quy tắc cho ${targetLabel(rule as CommissionRuleResponse, targets)}`}
            </DialogTitle>
            <DialogDescription>
              Thay đổi chỉ được snapshot vào booking tạo sau khi lưu, không tính lại booking cũ.
            </DialogDescription>
          </DialogHeader>

          {!isDefault && mode === 'create' ? (
            <TargetPicker
              scope={scope}
              targetId={targetId}
              targets={targets}
              onScopeChange={onScopeChange}
              onTargetChange={setTargetId}
            />
          ) : null}

          <div className="rounded-xl border bg-muted/20 p-4">
            <RateFields rule={rule} platformRate={rule?.platformRate} />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                Huỷ
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || (!isDefault && mode === 'create' && !targetId)}>
              Lưu quy tắc
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TargetPicker({
  scope,
  targetId,
  targets,
  onScopeChange,
  onTargetChange,
}: {
  scope: Exclude<CommissionAppliesToDto, 'tenant_default'>;
  targetId: string;
  targets: CommissionTargetOptions;
  onScopeChange: (scope: Exclude<CommissionAppliesToDto, 'tenant_default'>) => void;
  onTargetChange: (id: string) => void;
}) {
  const options = optionsForScope(scope, targets);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Phạm vi ưu tiên</Label>
        <Select value={scope} onValueChange={(value) => onScopeChange(value as typeof scope)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {targets.partners.length > 0 ? (
              <SelectItem value="partner">Đối tác cụ thể</SelectItem>
            ) : null}
            {targets.listingTypes.length > 0 ? (
              <SelectItem value="listing_type">Loại dịch vụ</SelectItem>
            ) : null}
            {targets.categories.length > 0 ? (
              <SelectItem value="category">Danh mục</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Áp dụng cho</Label>
        <Select value={targetId} onValueChange={onTargetChange}>
          <SelectTrigger>
            <SelectValue placeholder="Chọn một mục…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function RateFields({
  rule,
  platformRate,
}: {
  rule?: Pick<
    CommissionRuleResponse,
    'tenantRateType' | 'tenantRate' | 'affiliateRateType' | 'affiliateRate'
  >;
  platformRate?: number;
}) {
  const [tenantType, setTenantType] = useState<RateTypeDto>(rule?.tenantRateType ?? 'percent');
  const [affiliateType, setAffiliateType] = useState<RateTypeDto>(
    rule?.affiliateRateType ?? 'percent',
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <RateInput
          label="Tenant thu từ đối tác"
          name="tenantRate"
          typeName="tenantRateType"
          type={tenantType}
          onTypeChange={setTenantType}
          defaultValue={rule?.tenantRate ?? '15'}
        />
        <RateInput
          label="Hoa hồng cộng tác viên"
          name="affiliateRate"
          typeName="affiliateRateType"
          type={affiliateType}
          onTypeChange={setAffiliateType}
          defaultValue={rule?.affiliateRate ?? '0'}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Phí nền tảng{' '}
        {platformRate === undefined ? 'được kế thừa từ mức mặc định' : `là ${platformRate}%`}. Với
        tỷ lệ phần trăm, tổng phí nền tảng và CTV không được vượt phần tenant thu.
      </p>
    </div>
  );
}

function RateInput({
  label,
  name,
  typeName,
  type,
  onTypeChange,
  defaultValue,
}: {
  label: string;
  name: string;
  typeName: string;
  type: RateTypeDto;
  onTypeChange: (value: RateTypeDto) => void;
  defaultValue: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <input type="hidden" name={typeName} value={type} />
      <div className="grid grid-cols-[1fr_116px] gap-2">
        <Input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={0}
          max={type === 'percent' ? 100 : undefined}
          step={1}
          defaultValue={defaultValue}
          required
        />
        <Select value={type} onValueChange={(value) => onTypeChange(value as RateTypeDto)}>
          <SelectTrigger aria-label={`Đơn vị ${label.toLowerCase()}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">%</SelectItem>
            <SelectItem value="fixed">VNĐ</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function firstAvailableScope(
  targets: CommissionTargetOptions,
): Exclude<CommissionAppliesToDto, 'tenant_default'> {
  if (targets.partners.length > 0) return 'partner';
  if (targets.listingTypes.length > 0) return 'listing_type';
  return 'category';
}

function optionsForScope(
  scope: Exclude<CommissionAppliesToDto, 'tenant_default'>,
  targets: CommissionTargetOptions,
): CommissionTargetOption[] {
  if (scope === 'partner') return targets.partners;
  if (scope === 'listing_type') return targets.listingTypes;
  return targets.categories;
}

function ruleTargetId(rule: CommissionRuleResponse): string {
  return rule.partnerId ?? rule.listingTypeId ?? rule.categoryId ?? '';
}

function targetLabel(rule: CommissionRuleResponse, targets: CommissionTargetOptions): string {
  const id = ruleTargetId(rule);
  const option = optionsForScope(
    rule.appliesTo as Exclude<CommissionAppliesToDto, 'tenant_default'>,
    targets,
  ).find((item) => item.id === id);
  return option?.label ?? `Mục ${id.slice(0, 8)}`;
}

function formatRate(type: RateTypeDto, value: string): string {
  if (type === 'percent') return `${value}%`;
  return `${new Intl.NumberFormat('vi-VN').format(Number(value))} ₫`;
}
