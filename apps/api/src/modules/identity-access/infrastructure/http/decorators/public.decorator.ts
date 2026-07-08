import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marks a route as reachable without a session (health, auth, storefront). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
