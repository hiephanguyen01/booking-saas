import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../cookies';

export const AUTHENTICATED_ONLY = 'authenticatedOnly';

/** Routes that need a logged-in user but no specific permission (me, logout). */
export const AuthenticatedOnly = () =>
  applyDecorators(
    SetMetadata(AUTHENTICATED_ONLY, true),
    ApiCookieAuth(ACCESS_COOKIE),
    ApiBearerAuth(),
  );
