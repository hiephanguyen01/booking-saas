import { SetMetadata } from '@nestjs/common';

export const PLAN_LIMIT_RESOURCE = 'planLimitResource';
export type PlanLimitResource = 'partner' | 'listing';

/**
 * Enforces a hard plan limit before a create route runs, e.g.
 * `@EnforcePlanLimit('partner')`. Requires a resolved tenant context, so pair
 * it with a `@RequirePermissions('tenant.*')` route (PermissionsGuard seeds the
 * context). Combine via `@UseGuards(PlanLimitGuard)`.
 */
export const EnforcePlanLimit = (resource: PlanLimitResource) =>
  SetMetadata(PLAN_LIMIT_RESOURCE, resource);
