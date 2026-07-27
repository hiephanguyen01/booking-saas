import { z } from 'zod';
import { publicListingDetailResponseSchema } from './listing';

/** Public listing detail plus the resource timezone used by booking calendars. */
export const publicListingDetailWithTimezoneResponseSchema =
  publicListingDetailResponseSchema.extend({
    timezone: z.string().min(1).max(64),
  });

export type PublicListingDetailWithTimezoneResponse = z.infer<
  typeof publicListingDetailWithTimezoneResponseSchema
>;
