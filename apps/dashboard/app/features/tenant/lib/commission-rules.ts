import type {
  CommissionAppliesToDto,
  CommissionRuleResponse,
  RateTypeDto,
} from '@booking/contracts';

/**
 * Pure helpers behind the tenant commission-rules panel: which scopes a tenant
 * can actually target, and how a saved rule reads back as a label. Kept out of
 * the panel component so the picker, the rows and the dialog all derive a
 * target the same way.
 */

export interface CommissionTargetOption {
  id: string;
  label: string;
}

export interface CommissionTargetOptions {
  partners: CommissionTargetOption[];
  listingTypes: CommissionTargetOption[];
  categories: CommissionTargetOption[];
}

/** The scope an "add override" dialog should open on, given what exists. */
export function firstAvailableScope(
  targets: CommissionTargetOptions,
): Exclude<CommissionAppliesToDto, 'tenant_default'> {
  if (targets.partners.length > 0) return 'partner';
  if (targets.listingTypes.length > 0) return 'listing_type';
  return 'category';
}

export function optionsForScope(
  scope: Exclude<CommissionAppliesToDto, 'tenant_default'>,
  targets: CommissionTargetOptions,
): CommissionTargetOption[] {
  if (scope === 'partner') return targets.partners;
  if (scope === 'listing_type') return targets.listingTypes;
  return targets.categories;
}

/** A rule carries exactly one target id, in the column matching its scope. */
export function ruleTargetId(rule: CommissionRuleResponse): string {
  return rule.partnerId ?? rule.listingTypeId ?? rule.categoryId ?? '';
}

export function targetLabel(
  rule: CommissionRuleResponse,
  targets: CommissionTargetOptions,
): string {
  const id = ruleTargetId(rule);
  const option = optionsForScope(
    rule.appliesTo as Exclude<CommissionAppliesToDto, 'tenant_default'>,
    targets,
  ).find((item) => item.id === id);
  return option?.label ?? `Mục ${id.slice(0, 8)}`;
}

export function formatRate(type: RateTypeDto, value: string): string {
  if (type === 'percent') return `${value}%`;
  return `${new Intl.NumberFormat('vi-VN').format(Number(value))} ₫`;
}
