import { useState } from 'react';
import type { PromotionResponse } from '@booking/contracts';
import type { ScopeKey } from '~/constants/promotion';
import type { ScopeOption, ScopeOptions } from '../server/scope-options.server';

const DEFAULT_CHOICES: ScopeKey[] = [
  'all',
  'listing',
  'listing_type',
  'listing_group',
  'category',
  'partner',
];

/** Scopes a partner-funded promo may target — must resolve to a single partner (§12.2). */
const PARTNER_FUNDED_SCOPES: ScopeKey[] = ['partner', 'listing', 'listing_group'];

/** Option list backing the `appliesToId` picker for a scope; `null` → raw uuid input. */
export function optionsForScope(
  scope: ScopeKey,
  opts?: ScopeOptions,
  categories?: ScopeOption[],
): ScopeOption[] | null {
  // Categories come from their own endpoint, so they resolve even without `scopeOptions`.
  if (scope === 'category') return categories ?? null;
  if (!opts) return null;
  switch (scope) {
    case 'listing': return opts.listings;
    case 'listing_type': return opts.listingTypes;
    case 'listing_group': return opts.listingGroups;
    case 'partner': return opts.partners;
    default: return null; // `all` has no target to pick
  }
}

/**
 * The promotion form's funding/scope/target state machine. Encapsulates the two
 * §12.2 invariants that used to live inline in the form:
 *
 *  - A target id is meaningful *only* for the scope it was picked under —
 *    `changeAppliesTo` is the only way scope changes, and it always resets the id
 *    (a category uuid riding into a `listing` scope submits a cross-type id).
 *  - A partner-funded promo must target a single partner — `changeFundedBy`
 *    narrows the scope choices and forces a compliant scope when needed.
 */
export function usePromotionScope({
  promotion,
  restrictPartnerFunded = false,
  scopeChoices,
  scopeOptions,
  categoryOptions,
  selfPartnerId,
}: {
  promotion?: PromotionResponse;
  restrictPartnerFunded?: boolean;
  scopeChoices?: ScopeKey[];
  scopeOptions?: ScopeOptions;
  categoryOptions?: ScopeOption[];
  selfPartnerId?: string;
}) {
  const [fundedBy, setFundedBy] = useState<string>(
    restrictPartnerFunded ? 'partner' : (promotion?.fundedBy ?? 'tenant'),
  );
  const [appliesTo, setAppliesTo] = useState<ScopeKey>((promotion?.appliesTo as ScopeKey) ?? 'all');
  const [appliesToId, setAppliesToId] = useState<string>(promotion?.appliesToId ?? '');

  /** The only way `appliesTo` may change — always resets the target id with it. */
  const changeAppliesTo = (next: ScopeKey): void => {
    setAppliesTo(next);
    setAppliesToId('');
  };

  const changeFundedBy = (next: string): void => {
    setFundedBy(next);
    // Partner-funded needs a single-partner scope (§12.2) — force one, and reset
    // the target with it, or the previous scope's id rides along as a wrong-type id.
    if (next === 'partner' && !PARTNER_FUNDED_SCOPES.includes(appliesTo)) {
      changeAppliesTo('listing');
    }
  };

  const choices = scopeChoices ?? DEFAULT_CHOICES;
  // A partner-funded promo must target a single partner (§12.2) — narrow the scope options.
  const effectiveChoices =
    fundedBy === 'partner' ? choices.filter((c) => PARTNER_FUNDED_SCOPES.includes(c)) : choices;
  const optionList = optionsForScope(appliesTo, scopeOptions, categoryOptions);
  // The partner "self" scope targets the partner's own id — no picker needed.
  const isSelfPartnerScope = appliesTo === 'partner' && !!selfPartnerId;
  const appliesToIdValue =
    appliesTo === 'all' ? '' : isSelfPartnerScope ? (selfPartnerId ?? '') : appliesToId;

  return {
    fundedBy,
    changeFundedBy,
    appliesTo,
    changeAppliesTo,
    appliesToId,
    setAppliesToId,
    effectiveChoices,
    optionList,
    isSelfPartnerScope,
    appliesToIdValue,
  };
}
