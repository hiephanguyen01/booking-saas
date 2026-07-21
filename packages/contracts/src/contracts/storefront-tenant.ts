import { z } from 'zod';
import { publicTenantResponseSchema } from './tenancy';

/**
 * Host-resolved tenant bootstrap consumed by the Storefront BFF.
 *
 * Kept as an explicit extension during the timezone migration so existing
 * tenancy consumers are not widened accidentally. Once all callers move to
 * this contract, the older public tenant shape can be retired separately.
 */
export const storefrontTenantResponseSchema = publicTenantResponseSchema.extend({
  defaultTimezone: z.string().min(1).max(64),
});

export type StorefrontTenantResponse = z.infer<typeof storefrontTenantResponseSchema>;
