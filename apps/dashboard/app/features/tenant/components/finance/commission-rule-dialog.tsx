import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type {
  CommissionAppliesToDto,
  CommissionRuleResponse,
  RateTypeDto,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
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
import {
  firstAvailableScope,
  optionsForScope,
  ruleTargetId,
  targetLabel,
  type CommissionTargetOptions,
} from '~/features/tenant/lib/commission-rules';

/**
 * Create/edit dialog for a commission override, plus the rate inputs it shares
 * with the partner commission card. Split out of `commission-rules-panel`,
 * which carried the whole panel and this form in one 599-line file.
 */

export function RuleDialog({
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
