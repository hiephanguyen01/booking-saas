import type {
  CommissionAppliesToDto,
  CreateCommissionRuleInput,
  UpdateCommissionRuleInput,
} from '@booking/contracts';

function requiredValue(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

/** Translate the dashboard form names into the public commission contract. */
export function readCreateCommissionRule(form: FormData): CreateCommissionRuleInput {
  const appliesTo = requiredValue(form, 'appliesTo') as CommissionAppliesToDto;
  const input: CreateCommissionRuleInput = {
    appliesTo,
    tenantRateType: requiredValue(form, 'tenantRateType') as 'percent' | 'fixed',
    tenantRate: requiredValue(form, 'tenantRate'),
    affiliateRateType: requiredValue(form, 'affiliateRateType') as 'percent' | 'fixed',
    affiliateRate: requiredValue(form, 'affiliateRate'),
  };

  const targetId = requiredValue(form, 'targetId');
  if (appliesTo === 'partner') input.partnerId = targetId;
  if (appliesTo === 'listing_type') input.listingTypeId = targetId;
  if (appliesTo === 'category') input.categoryId = targetId;
  return input;
}

/** Rate-only patch used by the default and locked-target editors. */
export function readCommissionRatePatch(form: FormData): UpdateCommissionRuleInput {
  return {
    tenantRateType: requiredValue(form, 'tenantRateType') as 'percent' | 'fixed',
    tenantRate: requiredValue(form, 'tenantRate'),
    affiliateRateType: requiredValue(form, 'affiliateRateType') as 'percent' | 'fixed',
    affiliateRate: requiredValue(form, 'affiliateRate'),
  };
}
