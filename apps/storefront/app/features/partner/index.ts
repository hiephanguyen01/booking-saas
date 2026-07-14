/**
 * partner feature — public API
 *
 * Co-locates all partner self-registration logic.
 * The route (`routes/become-partner.tsx`) imports from here.
 *
 * Future: extract action.ts, BecomePartnerForm component, form schema here.
 */

export { registerOrLogin, applyAsPartner } from '../../lib/partner.server';

export type {
  RegisterCredentials,
  PartnerApplyPayload,
} from '../../lib/partner.server';
