import {
  bookingLookupInputSchema,
  bookingResponseSchema,
  type BookingResponse,
} from '@booking/contracts';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { data } from 'react-router';
import { z } from 'zod';
import { readRecentCodes } from '~/features/account/server/recent.server';
import { requestBookingOtp } from '~/features/booking/server/booking.server';
import { apiGet, rethrowApiInfrastructureFailure } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import { storefrontEnv } from '~/lib/server/env.server';
import { errorStatus } from '~/lib/http-status';
import { apiPaths } from '~/constants/api-paths';

export async function loadBookingsRoute({ request }: { request: Request }) {
  const recentPromise = readRecentCodes(request);
  const auth = getOptionalAuth();
  let myBookings: BookingResponse[] = [];
  if (auth) {
    const result = await apiGet<BookingResponse[]>(
      request,
      apiPaths.public.myBookings,
      auth.session.accessToken,
      {
        schema: z.array(bookingResponseSchema),
      },
    );
    rethrowApiInfrastructureFailure(result);
    if (result.ok && result.data) myBookings = result.data;
  }
  return { recent: await recentPromise, myBookings };
}

export async function actionBookingsRoute({ request }: { request: Request }) {
  const body = await readJsonRequestBody(request);
  const parsed = bookingLookupInputSchema.safeParse(body.ok ? body.value : {});
  if (!parsed.success) {
    return data(
      {
        sent: false,
        code: '',
        devOtp: null,
        error: null,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const code = parsed.data.code.toUpperCase();
  const result = await requestBookingOtp(request, code);
  if (!result.ok) {
    return data(
      {
        sent: false,
        code,
        devOtp: null,
        error: 'INVALID_CODE',
        fieldErrors: null,
      },
      { status: errorStatus(result.status) },
    );
  }

  return data({
    sent: true,
    code,
    devOtp: storefrontEnv.production ? null : (result.data?.devOtp ?? null),
    error: null,
    fieldErrors: null,
  });
}
