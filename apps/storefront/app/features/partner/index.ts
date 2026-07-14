/**
 * partner feature — public API
 *
 * Co-locates all partner self-registration logic.
 * The route (`routes/become-partner.tsx`) imports from here.
 *
 * Future: extract action.ts, BecomePartnerForm component, form schema here.
 */

// NOTE: server-only helpers live in `app/lib/partner.server.ts` and are imported
// directly from there by the onboarding routes — re-exporting them through this
// client-reachable barrel would pull server code into the client bundle. Types
// are safe to re-export:
export type {
  RegisterCredentials,
  PartnerApplyPayload,
} from '../../lib/partner.server';
