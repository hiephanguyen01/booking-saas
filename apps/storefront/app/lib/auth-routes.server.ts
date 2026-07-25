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
import { data, redirect } from 'react-router';
import { authFlow, flowView, type AuthFlowPhase, type AuthFlowView } from './auth-flow.server';
import { backendLogin, backendLogout, publicPost } from './api.server';
import { getOptionalAuth } from './auth.server';
import { requireLocale } from './i18n.server';
import { suppressStorefrontSessionCommit } from './request-context.server';
import { safeRedirectPath } from './safe-redirect';
import { createUserSession, destroyUserSession } from './session.server';
import type { AuthActionData } from './auth-types';

const fields = (form: FormData) => Object.fromEntries(form.entries());
const invalid = (fieldErrors: Record<string, string[] | undefined>) =>
  data<AuthActionData>(
    {
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).filter((entry): entry is [string, string[]] =>
          Boolean(entry[1]),
        ),
      ),
    },
    { status: 400 },
  );
const failed = (result: { status: number; code?: string; error?: string }) =>
  data<AuthActionData>(
    { error: result.code ?? result.error ?? 'UNKNOWN' },
    { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
  );

export async function startRegistrationAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const parsed = registrationStartInputSchema.safeParse({
    ...fields(await request.formData()),
    locale,
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthChallengeResponse>(
    request,
    '/auth/registration/start',
    parsed.data,
    {
      schema: authChallengeResponseSchema,
    },
  );
  if (!result.ok || !result.data) return failed(result);
  const setCookie = await authFlow.create(request, {
    phase: 'registration_verify',
    challengeId: result.data.challengeId,
    maskedDestination: result.data.maskedDestination,
    resendAvailableAt: Date.now() + result.data.resendAfterSec * 1_000,
  });
  return redirect(`/${locale}/auth/register/verify`, { headers: { 'Set-Cookie': setCookie } });
}

export async function startResetAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const parsed = passwordResetStartInputSchema.safeParse({
    ...fields(await request.formData()),
    locale,
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthChallengeResponse>(
    request,
    '/auth/password-reset/start',
    parsed.data,
    {
      schema: authChallengeResponseSchema,
    },
  );
  if (!result.ok || !result.data) return failed(result);
  const setCookie = await authFlow.create(request, {
    phase: 'reset_verify',
    challengeId: result.data.challengeId,
    maskedDestination: result.data.maskedDestination,
    resendAvailableAt: Date.now() + result.data.resendAfterSec * 1_000,
  });
  return redirect(`/${locale}/auth/forgot-password/verify`, {
    headers: { 'Set-Cookie': setCookie },
  });
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

/** Loader-safe flow gate: enforces the phase and returns only client-safe fields. */
export async function requireFlowView(
  request: Request,
  phase: AuthFlowPhase,
  fallback: string,
): Promise<AuthFlowView> {
  return flowView(await requireFlowPhase(request, phase, fallback));
}

/** Loader-safe phase gate for steps that render no flow data at all. */
export async function requireFlowPhaseOnly(
  request: Request,
  phase: AuthFlowPhase,
  fallback: string,
): Promise<null> {
  await requireFlowPhase(request, phase, fallback);
  return null;
}

export async function verifyAction(
  request: Request,
  localeParam: string | undefined,
  purpose: 'registration' | 'password_reset',
) {
  const locale = requireLocale(localeParam);
  const expected: AuthFlowPhase =
    purpose === 'registration' ? 'registration_verify' : 'reset_verify';
  const start =
    purpose === 'registration' ? `/${locale}/auth/register` : `/${locale}/auth/forgot-password`;
  const flow = await requireFlowPhase(request, expected, start);
  const form = await request.formData();
  if (form.get('intent') === 'resend') {
    if (flow.resendAfterSec > 0) {
      return data<AuthActionData>(
        { resent: false, resendAfterSec: flow.resendAfterSec },
        { status: 429 },
      );
    }

    const result = await publicPost<AuthChallengeResponse>(
      request,
      `/auth/${purpose === 'registration' ? 'registration' : 'password-reset'}/resend`,
      { challengeId: flow.record.challengeId },
      { schema: authChallengeResponseSchema },
    );
    if (!result.ok || !result.data) return failed(result);
    await authFlow.update(flow.id, {
      ...flow.record,
      maskedDestination: result.data.maskedDestination,
      resendAvailableAt: Date.now() + result.data.resendAfterSec * 1_000,
    });
    return data({ resent: true, resendAfterSec: result.data.resendAfterSec });
  }
  const parsed = authOtpVerifyInputSchema.safeParse({
    challengeId: flow.record.challengeId,
    code: form.get('code'),
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthOtpVerifiedResponse>(
    request,
    `/auth/${purpose === 'registration' ? 'registration' : 'password-reset'}/verify`,
    parsed.data,
    { schema: authOtpVerifiedResponseSchema },
  );
  if (!result.ok || !result.data) return failed(result);
  await authFlow.update(flow.id, {
    phase: purpose === 'registration' ? 'registration_password' : 'reset_password',
    completionToken: result.data.completionToken,
    maskedDestination: flow.record.maskedDestination,
  });
  return redirect(
    purpose === 'registration'
      ? `/${locale}/auth/register/password`
      : `/${locale}/auth/forgot-password/new-password`,
  );
}

export async function completePasswordAction(
  request: Request,
  localeParam: string | undefined,
  purpose: 'registration' | 'password_reset',
) {
  const locale = requireLocale(localeParam);
  const expected: AuthFlowPhase =
    purpose === 'registration' ? 'registration_password' : 'reset_password';
  const start =
    purpose === 'registration' ? `/${locale}/auth/register` : `/${locale}/auth/forgot-password`;
  const flow = await requireFlowPhase(request, expected, start);
  const form = fields(await request.formData());
  if (form.password !== form.confirmPassword) {
    return invalid({ confirmPassword: ['PASSWORD_MISMATCH'] });
  }
  const parsed = authPasswordCompleteInputSchema.safeParse({
    completionToken: flow.record.completionToken,
    password: form.password,
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthFlowCompleteResponse>(
    request,
    `/auth/${purpose === 'registration' ? 'registration' : 'password-reset'}/complete`,
    parsed.data,
    { schema: authFlowCompleteResponseSchema },
  );
  if (!result.ok || !result.data) return failed(result);
  await authFlow.update(flow.id, {
    phase: purpose === 'registration' ? 'registration_success' : 'reset_success',
  });
  return redirect(
    purpose === 'registration'
      ? `/${locale}/auth/register/success`
      : `/${locale}/auth/forgot-password/success`,
  );
}

export async function loginAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const form = await request.formData();
  const parsed = loginInputSchema.safeParse(fields(form));
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await backendLogin(request, parsed.data);
  if (!result.ok || !result.tokens || !result.user) return failed(result);
  suppressStorefrontSessionCommit();
  const url = new URL(request.url);
  const redirectTo = safeRedirectPath(url.searchParams.get('redirectTo'), `/${locale}`);
  return createUserSession(request, { ...result.tokens, userId: result.user.id }, redirectTo);
}

export async function logoutAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const auth = getOptionalAuth();
  if (auth) await backendLogout(request, auth.session.accessToken);
  suppressStorefrontSessionCommit();
  return destroyUserSession(request, `/${locale}`);
}
