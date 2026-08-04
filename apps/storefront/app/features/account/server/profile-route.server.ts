import {
  authFlowCompleteResponseSchema,
  currentUserSchema,
  customerPasswordChangeInputSchema,
  updateMyProfileInputSchema,
  type AuthFlowCompleteResponse,
  type CurrentUser,
} from '@booking/contracts';
import type { TranslationKey } from '@booking/i18n';
import { data } from 'react-router';
import { apiPaths } from '~/constants/api-paths';
import { apiPatch, apiPost } from '~/lib/server/api.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { forgetAuthSessionSnapshot } from '~/lib/server/auth-session-snapshot.server';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { getCurrentStorefrontTenant } from '~/lib/server/request-context.server';
import { localeTranslator } from '~/lib/translator';

/** The profile page's independent sections; each card submits exactly one. */
export type ProfileIntent = 'identity' | 'password';

/**
 * One result shape for both cards. `intent` is what lets a card tell "my save
 * succeeded" from "the other card's save succeeded" — without it, changing the
 * password would flash a success banner over the identity form too.
 */
export interface ProfileActionData {
  intent: ProfileIntent | '';
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[] | undefined> | null;
}

type StorefrontLocale = 'vi' | 'en';

const fail = (
  intent: ProfileIntent | '',
  error: string | null,
  fieldErrors: ProfileActionData['fieldErrors'] = null,
) => data<ProfileActionData>({ intent, saved: false, error, fieldErrors }, { status: 400 });

const succeed = (intent: ProfileIntent): ProfileActionData => ({
  intent,
  saved: true,
  error: null,
  fieldErrors: null,
});

/**
 * Backend codes the password card can explain on the offending input instead of
 * as a generic banner. `sanitizeApiResult` strips the API's own message, so the
 * wording is ours and localized here.
 */
const PASSWORD_FIELD_ERRORS: Record<string, { field: string; key: TranslationKey }> = {
  INVALID_CURRENT_PASSWORD: {
    field: 'currentPassword',
    key: 'account.profile.errors.invalidCurrentPassword',
  },
  PASSWORD_UNCHANGED: { field: 'newPassword', key: 'account.profile.errors.passwordUnchanged' },
  PASSWORD_NOT_SET: { field: 'currentPassword', key: 'account.profile.errors.passwordNotSet' },
};

export function loadAccountProfileRoute(request: Request, locale: StorefrontLocale) {
  requireCustomerAuth(request, locale, { includeSearch: false });
  return null;
}

export async function handleAccountProfileAction(request: Request, locale: StorefrontLocale) {
  const auth = requireCustomerAuth(request, locale, { includeSearch: false });
  const { t } = localeTranslator(locale);
  const body = await readJsonRequestBody(request);
  const value = body.ok && body.value && typeof body.value === 'object' ? body.value : {};
  const intent = (value as { intent?: unknown }).intent;

  if (intent === 'identity') {
    const parsed = updateMyProfileInputSchema.safeParse(value);
    if (!parsed.success) return fail('identity', null, parsed.error.flatten().fieldErrors);

    const result = await apiPatch<CurrentUser>(
      request,
      apiPaths.auth.me,
      parsed.data,
      auth.session.accessToken,
      { schema: currentUserSchema },
    );
    if (!result.ok) {
      return fail('identity', result.error ?? t('account.profile.errors.identityFailed'));
    }

    // The account layout re-reads the identity on revalidation; without this it
    // would serve the pre-edit name from the session snapshot cache.
    forgetAuthSessionSnapshot({
      tenantId: getCurrentStorefrontTenant().id,
      sessionId: auth.sessionId,
    });
    return succeed('identity');
  }

  if (intent === 'password') {
    const parsed = customerPasswordChangeInputSchema.safeParse(value);
    if (!parsed.success) return fail('password', null, parsed.error.flatten().fieldErrors);

    const result = await apiPost<AuthFlowCompleteResponse>(
      request,
      apiPaths.auth.mePassword,
      { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
      auth.session.accessToken,
      { schema: authFlowCompleteResponseSchema },
    );
    if (!result.ok) {
      const mapped = result.code ? PASSWORD_FIELD_ERRORS[result.code] : undefined;
      return mapped
        ? fail('password', null, { [mapped.field]: [t(mapped.key)] })
        : fail('password', result.error ?? t('account.profile.errors.passwordFailed'));
    }
    return succeed('password');
  }

  return fail('', t('account.profile.errors.invalidRequest'));
}
