import {
  authChallengeResponseSchema,
  authFlowCompleteResponseSchema,
  authOtpVerifiedResponseSchema,
  authOtpVerifyInputSchema,
  authPasswordCompleteInputSchema,
  loginInputSchema,
  passwordResetStartInputSchema,
  registrationStartInputSchema,
  type AuthChallengeResponse,
  type AuthFlowCompleteResponse,
  type AuthOtpVerifiedResponse,
} from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { data, redirect } from 'react-router';
import type { ZodType } from 'zod';
import { isStorefrontAuthPath, storefrontPaths } from '~/constants/paths';
import {
  authFlow,
  flowView,
  type AuthFlowPhase,
  type AuthFlowView,
} from '~/features/auth/server/auth-flow.server';
import { backendLogin, backendLogout, publicPost } from '~/lib/server/api.server';
import { getOptionalAuth, requireGuestAuth } from '~/lib/server/auth.server';
import {
  failedAuthForm,
  failedAuthRequest,
  formFields,
  invalidAuthInput,
  readAuthForm,
} from '~/features/auth/server/auth-form.server';
import { loadLegalConsentBundle } from '~/features/legal/server/legal.server';
import { requireLocale } from '~/lib/server/i18n.server';
import {
  getOptionalStorefrontTenant,
  suppressStorefrontSessionCommit,
} from '~/lib/server/request-context.server';
import { safeRedirectPath } from '~/lib/safe-redirect';
import { createUserSession, destroyUserSession } from '~/lib/server/session.server';
import type { AuthActionData } from '~/lib/auth-types';
import { apiPaths } from '~/constants/api-paths';

export type AuthPurpose = 'registration' | 'password_reset';

/**
 * Registration and password reset walk the identical three-step OTP flow — start,
 * verify, set password — and differ only in which backend prefix they post to, which
 * phase names the flow cookie carries and which pages those phases render. Declaring
 * that difference once keeps each action about the step it performs; it used to be
 * eight `purpose === 'registration' ? … : …` ternaries spread across two functions.
 */
const AUTH_PURPOSES = {
  registration: {
    endpoint: 'registration',
    startSchema: registrationStartInputSchema,
    verifyPhase: 'registration_verify',
    passwordPhase: 'registration_password',
    successPhase: 'registration_success',
    startPath: storefrontPaths.register,
    verifyPath: storefrontPaths.registerVerify,
    passwordPath: storefrontPaths.registerPassword,
    successPath: storefrontPaths.registerSuccess,
  },
  password_reset: {
    endpoint: 'password-reset',
    startSchema: passwordResetStartInputSchema,
    verifyPhase: 'reset_verify',
    passwordPhase: 'reset_password',
    successPhase: 'reset_success',
    startPath: storefrontPaths.forgotPassword,
    verifyPath: storefrontPaths.forgotPasswordVerify,
    passwordPath: storefrontPaths.forgotPasswordNewPassword,
    successPath: storefrontPaths.forgotPasswordSuccess,
  },
} as const satisfies Record<
  AuthPurpose,
  {
    endpoint: string;
    startSchema: ZodType;
    verifyPhase: AuthFlowPhase;
    passwordPhase: AuthFlowPhase;
    successPhase: AuthFlowPhase;
    startPath: (locale: Locale) => string;
    verifyPath: (locale: Locale) => string;
    passwordPath: (locale: Locale) => string;
    successPath: (locale: Locale) => string;
  }
>;

/** Customer registration requires accepting these two documents (§ Consent capture). */
const CUSTOMER_REGISTRATION_LEGAL_TYPES = ['customer_terms', 'privacy_policy'] as const;

/** `register.tsx`'s loader: the guest gate plus the two documents its consent tick names. */
export async function loadRegisterRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  requireGuestAuth(locale);
  const legalConsent = await loadLegalConsentBundle(request, locale, CUSTOMER_REGISTRATION_LEGAL_TYPES);
  return { legalConsent };
}

export async function startRegistrationAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  requireGuestAuth(locale);
  return startAuthFlowAction(request, locale, 'registration');
}

export async function startResetAction(request: Request, localeParam?: string) {
  return startAuthFlowAction(request, requireLocale(localeParam), 'password_reset');
}

/**
 * `useAuthStartFormController` submits a plain JS object via `useSubmit`, which
 * React Router serializes through `new URLSearchParams(object)` (no
 * `encType: 'application/json'` here, unlike the GenericForm-based flows) — an
 * array value there is coerced through `Array.prototype.toString`, i.e. joined
 * with commas, not kept as multiple form entries. Undo that before validating
 * against `registrationStartInputSchema`'s `acceptedVersionIds: uuid[]`; a
 * blank/missing field stays `undefined` so `passwordResetStartInputSchema`
 * (which has no such field) is unaffected — zod strips unknown keys.
 */
function splitAcceptedVersionIds(value: FormDataEntryValue | undefined): string[] | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  return value.split(',').filter(Boolean);
}

/** Requests the OTP challenge and parks the flow on its verify step. */
async function startAuthFlowAction(request: Request, locale: Locale, purpose: AuthPurpose) {
  const flow = AUTH_PURPOSES[purpose];
  const formBody = await readAuthForm(request);
  if (!formBody.ok) return failedAuthForm(formBody);

  const tenant = getOptionalStorefrontTenant();
  const fields = formFields(formBody.value);
  const acceptedVersionIds = splitAcceptedVersionIds(fields.acceptedVersionIds);
  const parsed = flow.startSchema.safeParse({
    ...fields,
    ...(acceptedVersionIds ? { acceptedVersionIds } : {}),
    locale,
    ...(tenant ? { tenantId: tenant.id } : {}),
  });
  if (!parsed.success) return invalidAuthInput(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthChallengeResponse>(
    request,
    apiPaths.auth.flowStart(flow.endpoint),
    parsed.data,
    { schema: authChallengeResponseSchema },
  );
  if (!result.ok || !result.data) return failedAuthRequest(result);
  const setCookie = await authFlow.create(request, {
    phase: flow.verifyPhase,
    ...(tenant ? { tenantId: tenant.id } : {}),
    challengeId: result.data.challengeId,
    maskedDestination: result.data.maskedDestination,
    resendAvailableAt: resendAvailableAt(result.data.resendAfterSec),
  });
  return redirect(flow.verifyPath(locale), { headers: { 'Set-Cookie': setCookie } });
}

function resendAvailableAt(resendAfterSec: number): number {
  return Date.now() + resendAfterSec * 1_000;
}

/**
 * Server-side flow accessor: returns the full record, including the
 * `completionToken`. Safe only inside an action — never return this from a
 * loader (see `AuthFlowView`); use `requireFlowView` there instead.
 */
export async function requireFlowPhase(request: Request, phase: AuthFlowPhase, fallback: string) {
  const flow = await authFlow.read(request);
  if (!flow || flow.record.phase !== phase) throw redirect(fallback);
  return {
    ...flow,
    resendAfterSec: Math.max(
      0,
      Math.ceil(((flow.record.resendAvailableAt ?? Date.now()) - Date.now()) / 1_000),
    ),
  };
}

/** The flow steps a route can gate on; `AUTH_PURPOSES` maps each to its phase. */
export type AuthFlowStep = 'verify' | 'password' | 'success';

const STEP_PHASES = {
  verify: 'verifyPhase',
  password: 'passwordPhase',
  success: 'successPhase',
} as const satisfies Record<AuthFlowStep, keyof (typeof AUTH_PURPOSES)['registration']>;

/**
 * Both loader gates take the purpose and step rather than a redirect string, so
 * the fallback comes from `AUTH_PURPOSES` — the table that already owns every
 * path in the flow. Six route modules used to hand-build `/${locale}/auth/…`.
 */
function stepPhase(purpose: AuthPurpose, step: AuthFlowStep): AuthFlowPhase {
  return AUTH_PURPOSES[purpose][STEP_PHASES[step]];
}

/** Loader-safe flow gate: enforces the phase and returns only client-safe fields. */
export async function requireFlowView(
  request: Request,
  purpose: AuthPurpose,
  step: AuthFlowStep,
  localeParam: string | undefined,
): Promise<AuthFlowView> {
  const locale = requireLocale(localeParam);
  const phase = stepPhase(purpose, step);
  return flowView(await requireFlowPhase(request, phase, AUTH_PURPOSES[purpose].startPath(locale)));
}

/** Loader-safe phase gate for steps that render no flow data at all. */
export async function requireFlowPhaseOnly(
  request: Request,
  purpose: AuthPurpose,
  step: AuthFlowStep,
  localeParam: string | undefined,
): Promise<null> {
  const locale = requireLocale(localeParam);
  const phase = stepPhase(purpose, step);
  await requireFlowPhase(request, phase, AUTH_PURPOSES[purpose].startPath(locale));
  return null;
}

export async function verifyAction(
  request: Request,
  localeParam: string | undefined,
  purpose: AuthPurpose,
) {
  const locale = requireLocale(localeParam);
  const config = AUTH_PURPOSES[purpose];
  const flow = await requireFlowPhase(request, config.verifyPhase, config.startPath(locale));
  const formBody = await readAuthForm(request);
  if (!formBody.ok) return failedAuthForm(formBody);
  const form = formBody.value;

  if (form.get('intent') === 'resend') {
    if (flow.resendAfterSec > 0) {
      return data<AuthActionData>(
        { resent: false, resendAfterSec: flow.resendAfterSec },
        { status: 429 },
      );
    }

    const result = await publicPost<AuthChallengeResponse>(
      request,
      apiPaths.auth.flowResend(config.endpoint),
      {
        challengeId: flow.record.challengeId,
        ...(flow.record.tenantId ? { tenantId: flow.record.tenantId } : {}),
      },
      { schema: authChallengeResponseSchema },
    );
    if (!result.ok || !result.data) return failedAuthRequest(result);
    await authFlow.update(flow.id, {
      ...flow.record,
      maskedDestination: result.data.maskedDestination,
      resendAvailableAt: resendAvailableAt(result.data.resendAfterSec),
    });
    return data({ resent: true, resendAfterSec: result.data.resendAfterSec });
  }
  const parsed = authOtpVerifyInputSchema.safeParse({
    challengeId: flow.record.challengeId,
    code: form.get('code'),
  });
  if (!parsed.success) return invalidAuthInput(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthOtpVerifiedResponse>(
    request,
    apiPaths.auth.flowVerify(config.endpoint),
    parsed.data,
    { schema: authOtpVerifiedResponseSchema },
  );
  if (!result.ok || !result.data) return failedAuthRequest(result);
  await authFlow.update(flow.id, {
    phase: config.passwordPhase,
    completionToken: result.data.completionToken,
    maskedDestination: flow.record.maskedDestination,
  });
  return redirect(config.passwordPath(locale));
}

export async function completePasswordAction(
  request: Request,
  localeParam: string | undefined,
  purpose: AuthPurpose,
) {
  const locale = requireLocale(localeParam);
  const config = AUTH_PURPOSES[purpose];
  const flow = await requireFlowPhase(request, config.passwordPhase, config.startPath(locale));
  const formBody = await readAuthForm(request);
  if (!formBody.ok) return failedAuthForm(formBody);
  const form = formFields(formBody.value);

  if (form.password !== form.confirmPassword) {
    return invalidAuthInput({ confirmPassword: ['PASSWORD_MISMATCH'] });
  }
  const parsed = authPasswordCompleteInputSchema.safeParse({
    completionToken: flow.record.completionToken,
    password: form.password,
  });
  if (!parsed.success) return invalidAuthInput(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthFlowCompleteResponse>(
    request,
    apiPaths.auth.flowComplete(config.endpoint),
    parsed.data,
    { schema: authFlowCompleteResponseSchema },
  );
  if (!result.ok || !result.data) return failedAuthRequest(result);
  await authFlow.update(flow.id, { phase: config.successPhase });
  return redirect(config.successPath(locale));
}

export async function loginAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  requireGuestAuth(locale);
  const formBody = await readAuthForm(request);
  if (!formBody.ok) return failedAuthForm(formBody);
  const parsed = loginInputSchema.safeParse(formFields(formBody.value));
  if (!parsed.success) return invalidAuthInput(parsed.error.flatten().fieldErrors);
  const result = await backendLogin(request, parsed.data);
  if (!result.ok || !result.tokens || !result.user) return failedAuthRequest(result);
  suppressStorefrontSessionCommit();
  const url = new URL(request.url);
  const fallback = storefrontPaths.home(locale);
  const requestedRedirect = safeRedirectPath(url.searchParams.get('redirectTo'), fallback);
  const redirectTo = isStorefrontAuthPath(requestedRedirect) ? fallback : requestedRedirect;
  return createUserSession(request, { ...result.tokens, userId: result.user.id }, redirectTo);
}

export async function logoutAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const auth = getOptionalAuth();
  if (auth) await backendLogout(request, auth.session.accessToken);
  suppressStorefrontSessionCommit();
  return destroyUserSession(request, storefrontPaths.home(locale));
}
