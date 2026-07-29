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
import { storefrontPaths } from '~/constants/paths';
import {
  authFlow,
  flowView,
  type AuthFlowPhase,
  type AuthFlowView,
} from '~/features/auth/server/auth-flow.server';
import { backendLogin, backendLogout, publicPost } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import {
  formRequestFailureStatus,
  readFormRequestBody,
  type FormRequestBody,
} from '~/lib/server/form-request.server';
import { requireLocale } from '~/lib/server/i18n.server';
import { suppressStorefrontSessionCommit } from '~/lib/server/request-context.server';
import { safeRedirectPath } from '~/lib/safe-redirect';
import { createUserSession, destroyUserSession } from '~/lib/server/session.server';
import type { AuthActionData } from '~/lib/auth-types';

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

const AUTH_MAX_FORM_BYTES = 16 * 1024;
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
const readAuthForm = (request: Request) => readFormRequestBody(request, AUTH_MAX_FORM_BYTES);
const failedAuthForm = (result: Extract<FormRequestBody, { ok: false }>) =>
  failed({ status: formRequestFailureStatus(result.code), code: result.code });

export async function startRegistrationAction(request: Request, localeParam?: string) {
  return startAuthFlowAction(request, localeParam, 'registration');
}

export async function startResetAction(request: Request, localeParam?: string) {
  return startAuthFlowAction(request, localeParam, 'password_reset');
}

/** Requests the OTP challenge and parks the flow on its verify step. */
async function startAuthFlowAction(
  request: Request,
  localeParam: string | undefined,
  purpose: AuthPurpose,
) {
  const locale = requireLocale(localeParam);
  const flow = AUTH_PURPOSES[purpose];
  const formBody = await readAuthForm(request);
  if (!formBody.ok) return failedAuthForm(formBody);

  const parsed = flow.startSchema.safeParse({ ...fields(formBody.value), locale });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthChallengeResponse>(
    request,
    `/auth/${flow.endpoint}/start`,
    parsed.data,
    { schema: authChallengeResponseSchema },
  );
  if (!result.ok || !result.data) return failed(result);
  const setCookie = await authFlow.create(request, {
    phase: flow.verifyPhase,
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
      `/auth/${config.endpoint}/resend`,
      { challengeId: flow.record.challengeId },
      { schema: authChallengeResponseSchema },
    );
    if (!result.ok || !result.data) return failed(result);
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
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthOtpVerifiedResponse>(
    request,
    `/auth/${config.endpoint}/verify`,
    parsed.data,
    { schema: authOtpVerifiedResponseSchema },
  );
  if (!result.ok || !result.data) return failed(result);
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
  const form = fields(formBody.value);

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
    `/auth/${config.endpoint}/complete`,
    parsed.data,
    { schema: authFlowCompleteResponseSchema },
  );
  if (!result.ok || !result.data) return failed(result);
  await authFlow.update(flow.id, { phase: config.successPhase });
  return redirect(config.successPath(locale));
}

export async function loginAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const formBody = await readAuthForm(request);
  if (!formBody.ok) return failedAuthForm(formBody);
  const parsed = loginInputSchema.safeParse(fields(formBody.value));
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await backendLogin(request, parsed.data);
  if (!result.ok || !result.tokens || !result.user) return failed(result);
  suppressStorefrontSessionCommit();
  const url = new URL(request.url);
  const redirectTo = safeRedirectPath(url.searchParams.get('redirectTo'), storefrontPaths.home(locale));
  return createUserSession(request, { ...result.tokens, userId: result.user.id }, redirectTo);
}

export async function logoutAction(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const auth = getOptionalAuth();
  if (auth) await backendLogout(request, auth.session.accessToken);
  suppressStorefrontSessionCommit();
  return destroyUserSession(request, storefrontPaths.home(locale));
}
