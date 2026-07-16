import {
  authChallengeResponseSchema,
  authFlowCompleteResponseSchema,
  authOtpVerifiedResponseSchema,
  authOtpVerifyInputSchema,
  authPasswordCompleteInputSchema,
  partnerOnboardingProfileSchema,
  type AuthChallengeResponse,
  type AuthFlowCompleteResponse,
  type AuthOtpVerifiedResponse,
  type PartnerOnboardingProfileInput,
} from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { data, redirect } from 'react-router';
import { backendLogin, publicPost } from './api.server';
import { authFlow, flowView, type AuthFlowPhase, type AuthFlowView } from './auth-flow.server';
import { getOptionalAuth, requireAuth } from './auth.server';
import { applyAsPartner, type PartnerApplyPayload, type PartnerErrorCode } from './partner.server';
import { suppressStorefrontSessionCommit } from './request-auth.server';
import { createUserSession } from './session.server';
import { resolveTenant } from './tenant.server';
import { loadAdministrativeProvinces } from './administrative-divisions.server';

export interface PartnerOnboardingActionData {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  resendAfterSec?: number;
}

const localeOf = (value?: string): Locale => (value === 'en' ? 'en' : 'vi');
const startPath = (locale: Locale) => `/${locale}/become-partner`;
const path = (locale: Locale, step: string) => `${startPath(locale)}/${step}`;
const fields = (form: FormData) => Object.fromEntries(form.entries());
const invalid = (fieldErrors: Record<string, string[] | undefined>) =>
  data<PartnerOnboardingActionData>(
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
  data<PartnerOnboardingActionData>(
    { error: result.code ?? result.error ?? 'UNKNOWN' },
    { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
  );

function inferredName(email: string) {
  const local = email
    .split('@')[0]
    ?.replace(/[._-]+/g, ' ')
    .trim();
  return local || 'Đối tác mới';
}

export type PartnerRegistrationEntry = 'register' | 'profile' | 'dashboard';

/** Decide the first onboarding step without mutating auth or flow state. */
export function partnerRegistrationEntry(
  auth: ReturnType<typeof getOptionalAuth>,
  tenantId: string,
): PartnerRegistrationEntry {
  if (!auth) return 'register';
  const alreadyPartner = auth.info.scopes.some(
    (membership) => membership.scope === 'partner' && membership.tenantId === tenantId,
  );
  return alreadyPartner ? 'dashboard' : 'profile';
}

export async function startPartnerRegistration(request: Request, localeParam?: string) {
  const locale = localeOf(localeParam);
  const auth = getOptionalAuth();
  if (auth) {
    const tenant = await resolveTenant(request);
    const entry = partnerRegistrationEntry(auth, tenant.id);
    if (entry === 'dashboard') {
      return redirect(`${process.env.DASHBOARD_URL ?? 'http://localhost:5174'}/partner`);
    }
    const setCookie = await authFlow.create(request, {
      phase: 'partner_registration_profile',
      email: auth.info.user.email,
      maskedDestination: auth.info.user.email,
    });
    return redirect(path(locale, 'profile'), { headers: { 'Set-Cookie': setCookie } });
  }
  const form = fields(await request.formData());
  const email = String(form.email ?? '')
    .trim()
    .toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return invalid({ email: ['Email không hợp lệ'] });
  const result = await publicPost<AuthChallengeResponse>(
    '/auth/registration/start',
    { email, fullName: inferredName(email), locale },
    { signal: request.signal, schema: authChallengeResponseSchema },
  );
  if (!result.ok || !result.data) return failed(result);
  const setCookie = await authFlow.create(request, {
    phase: 'partner_registration_verify',
    email,
    challengeId: result.data.challengeId,
    maskedDestination: result.data.maskedDestination,
    resendAvailableAt: Date.now() + result.data.resendAfterSec * 1_000,
  });
  return redirect(path(locale, 'verify'), { headers: { 'Set-Cookie': setCookie } });
}

/**
 * Server-side flow accessor: returns the full record, including the
 * `completionToken`. Safe only inside an action — never return this from a
 * loader (see `AuthFlowView`); use `requirePartnerView` there instead.
 */
export async function requirePartnerPhase(
  request: Request,
  phase: AuthFlowPhase,
  localeParam?: string,
) {
  const locale = localeOf(localeParam);
  const flow = await authFlow.read(request);
  if (!flow || flow.record.phase !== phase) throw redirect(startPath(locale));
  return {
    ...flow,
    resendAfterSec: Math.max(
      0,
      Math.ceil(((flow.record.resendAvailableAt ?? Date.now()) - Date.now()) / 1_000),
    ),
  };
}

/** Loader-safe flow gate: enforces the phase and returns only client-safe fields. */
export async function requirePartnerView(
  request: Request,
  phase: AuthFlowPhase,
  localeParam?: string,
): Promise<AuthFlowView> {
  return flowView(await requirePartnerPhase(request, phase, localeParam));
}

/** Loader-safe phase gate for steps that render no flow data at all. */
export async function requirePartnerPhaseOnly(
  request: Request,
  phase: AuthFlowPhase,
  localeParam?: string,
): Promise<null> {
  await requirePartnerPhase(request, phase, localeParam);
  return null;
}

export async function verifyPartnerRegistration(request: Request, localeParam?: string) {
  const locale = localeOf(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_verify', locale);
  const form = await request.formData();
  if (form.get('intent') === 'resend') {
    const result = await publicPost<AuthChallengeResponse>(
      '/auth/registration/resend',
      { challengeId: flow.record.challengeId },
      { signal: request.signal, schema: authChallengeResponseSchema },
    );
    if (!result.ok || !result.data) return failed(result);
    await authFlow.update(flow.id, {
      ...flow.record,
      maskedDestination: result.data.maskedDestination,
      resendAvailableAt: Date.now() + result.data.resendAfterSec * 1_000,
    });
    return data({ resendAfterSec: result.data.resendAfterSec });
  }
  const parsed = authOtpVerifyInputSchema.safeParse({
    challengeId: flow.record.challengeId,
    code: form.get('code'),
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await publicPost<AuthOtpVerifiedResponse>(
    '/auth/registration/verify',
    parsed.data,
    {
      signal: request.signal,
      schema: authOtpVerifiedResponseSchema,
    },
  );
  if (!result.ok || !result.data) return failed(result);
  await authFlow.update(flow.id, {
    phase: 'partner_registration_password',
    email: flow.record.email,
    maskedDestination: flow.record.maskedDestination,
    completionToken: result.data.completionToken,
  });
  return redirect(path(locale, 'password'));
}

const partnerPasswordSchema = authPasswordCompleteInputSchema
  .omit({ completionToken: true })
  .extend({
    password: authPasswordCompleteInputSchema.shape.password
      .regex(/[A-Z]/, 'Cần ít nhất một chữ hoa')
      .regex(/[^A-Za-z0-9]/, 'Cần ít nhất một ký tự đặc biệt'),
  });

export async function completePartnerPassword(request: Request, localeParam?: string) {
  const locale = localeOf(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_password', locale);
  const form = fields(await request.formData());
  if (form.password !== form.confirmPassword) {
    return invalid({ confirmPassword: ['Mật khẩu nhập lại không khớp'] });
  }
  const local = partnerPasswordSchema.safeParse({ password: form.password });
  if (!local.success) return invalid(local.error.flatten().fieldErrors);
  const parsed = authPasswordCompleteInputSchema.safeParse({
    completionToken: flow.record.completionToken,
    password: form.password,
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const completed = await publicPost<AuthFlowCompleteResponse>(
    '/auth/registration/complete',
    parsed.data,
    { signal: request.signal, schema: authFlowCompleteResponseSchema },
  );
  if (!completed.ok || !completed.data) return failed(completed);
  const login = await backendLogin({
    email: flow.record.email ?? '',
    password: String(form.password),
  });
  if (!login.ok || !login.tokens || !login.user) return failed(login);
  await authFlow.update(flow.id, {
    phase: 'partner_registration_profile',
    email: flow.record.email,
    maskedDestination: flow.record.maskedDestination,
  });
  suppressStorefrontSessionCommit();
  return createUserSession(
    request,
    { ...login.tokens, userId: login.user.id },
    path(locale, 'profile'),
  );
}

export function partnerSlugFor(name: string, userId: string) {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'doi-tac'}-${userId.replace(/-/g, '').slice(0, 8)}`;
}

/** Map the storefront profile contract to the API's partner-application payload. */
export function partnerApplyPayloadFor(
  value: PartnerOnboardingProfileInput,
  tenantId: string,
  userId: string,
): PartnerApplyPayload {
  const businessInfo: Record<string, unknown> = {
    representativeName: value.representativeName,
    identityNumber: value.identityNumber,
    identityCardFrontUrl: value.identityCardFrontUrl,
    identityCardBackUrl: value.identityCardBackUrl,
  };
  if (value.partnerType === 'company') {
    businessInfo.legalName = value.companyName;
    businessInfo.businessRegistrationNo = value.businessRegistrationNo;
    businessInfo.taxId = value.businessRegistrationNo;
    businessInfo.businessLicenseFrontUrl = value.businessLicenseFrontUrl;
    businessInfo.businessLicenseBackUrl = value.businessLicenseBackUrl;
  }
  return {
    tenantId,
    name: value.name,
    slug: partnerSlugFor(value.name, userId),
    partnerType: value.partnerType,
    businessInfo,
    contactInfo: {
      phone: value.phone,
      provinceCode: value.provinceCode,
      wardCode: value.wardCode,
      address: value.address,
    },
    payoutInfo: {
      bank: value.bank,
      accountNumber: value.bankAccountNumber,
      holderName: value.bankAccountHolder,
    },
  };
}

export async function loadPartnerProfile(request: Request, localeParam?: string) {
  const locale = localeOf(localeParam);
  await requirePartnerPhase(request, 'partner_registration_profile', locale);
  const auth = requireAuth(startPath(locale));
  const [tenant, provinces] = await Promise.all([
    resolveTenant(request),
    loadAdministrativeProvinces(request),
  ]);
  // The flow record is deliberately not returned — it holds the completionToken.
  return { email: auth.info.user.email, tenantName: tenant.name, provinces };
}

export async function submitPartnerProfile(request: Request, localeParam?: string) {
  const locale = localeOf(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_profile', locale);
  const auth = requireAuth(startPath(locale));
  const tenant = await resolveTenant(request);
  const parsed = partnerOnboardingProfileSchema.safeParse(await request.json());
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const payload = partnerApplyPayloadFor(parsed.data, tenant.id, auth.session.userId);
  const applied = await applyAsPartner(auth.session.accessToken, payload);
  if (!applied.ok) {
    return data<PartnerOnboardingActionData>(
      { error: applied.code satisfies PartnerErrorCode },
      { status: 400 },
    );
  }
  await authFlow.update(flow.id, {
    phase: 'partner_registration_done',
    email: flow.record.email,
    maskedDestination: flow.record.maskedDestination,
  });
  return redirect(path(locale, 'done'));
}

export async function loadPartnerDone(request: Request, localeParam?: string) {
  const locale = localeOf(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_done', locale);
  return {
    maskedEmail: flow.record.maskedDestination ?? flow.record.email ?? '',
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
  };
}
