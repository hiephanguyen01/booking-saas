import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_ONLY = 'authenticatedOnly';

/** Routes that need a logged-in user but no specific permission (me, logout). */
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY, true);
