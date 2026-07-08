import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS = 'requiredPermissions';

/**
 * Declares the permission keys a route needs, e.g.
 * `@RequirePermissions('tenant.listings.write')`. Routes that are neither
 * @Public, @AuthenticatedOnly, nor decorated with this are denied outright.
 */
export const RequirePermissions = (...keys: string[]) => SetMetadata(REQUIRED_PERMISSIONS, keys);
