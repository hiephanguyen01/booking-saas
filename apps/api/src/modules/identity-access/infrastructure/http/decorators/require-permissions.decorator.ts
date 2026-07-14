import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../cookies';

export const REQUIRED_PERMISSIONS = 'requiredPermissions';

/**
 * Declares the permission keys a route needs, e.g.
 * `@RequirePermissions('tenant.listings.write')`. Routes that are neither
 * @Public, @AuthenticatedOnly, nor decorated with this are denied outright.
 */
export const RequirePermissions = (...keys: string[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS, keys),
    ApiCookieAuth(ACCESS_COOKIE),
    ApiBearerAuth(),
  );
