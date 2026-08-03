import { acceptanceRecordSchema, type AcceptanceRecord } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { z } from 'zod';
import { apiGet } from '~/lib/server/api.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { apiPaths } from '~/constants/api-paths';

const acceptanceListSchema = z.array(acceptanceRecordSchema);

export interface AccountTermsRouteData {
  locale: Locale;
  acceptances: AcceptanceRecord[];
  loadFailed: boolean;
}

/** apiPaths.account.terms — "the terms I accepted": `GET /me/legal/acceptances`, newest first. */
export async function loadAccountTermsRoute(
  request: Request,
  locale: Locale,
): Promise<AccountTermsRouteData> {
  const auth = requireCustomerAuth(request, locale);
  const result = await apiGet(request, apiPaths.account.legalAcceptances, auth.session.accessToken, {
    schema: acceptanceListSchema,
  });

  return {
    locale,
    acceptances: result.ok && result.data ? result.data : [],
    loadFailed: !result.ok,
  };
}
