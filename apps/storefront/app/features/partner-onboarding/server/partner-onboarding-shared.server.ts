import type { Locale } from '@booking/i18n';
import { data, redirect } from 'react-router';
import {
  authFlow,
  flowView,
  type AuthFlowPhase,
  type AuthFlowView,
} from '../../../lib/auth-flow.server';
import {
  formRequestFailureStatus,
  readFormRequestBody,
  type FormRequestBody,
} from '../../../lib/form-request.server';

const PARTNER_MAX_FORM_BYTES = 16 * 1024;

export interface PartnerOnboardingActionData {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  resendAfterSec?: number;
}

export const partnerStartPath = (locale: Locale) => `/${locale}/become-partner`;
export const partnerStepPath = (locale: Locale, step: string) =>
  `${partnerStartPath(locale)}/${step}`;

export const partnerFormFields = (form: FormData) => Object.fromEntries(form.entries());
export const readPartnerFormData = (request: Request) =>
  readFormRequestBody(request, PARTNER_MAX_FORM_BYTES);
export const failedPartnerFormData = (result: Extract<FormRequestBody, { ok: false }>) =>
  failedPartnerOnboarding({
    status: formRequestFailureStatus(result.code),
    code: result.code,
  });

export function invalidPartnerOnboarding(
  fieldErrors: Record<string, string[] | undefined>,
) {
  return data<PartnerOnboardingActionData>(
    {
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).filter((entry): entry is [string, string[]] =>
          Boolean(entry[1]),
        ),
      ),
    },
    { status: 400 },
  );
}

export function failedPartnerOnboarding(result: {
  status: number;
  code?: string;
  error?: string;
}) {
  return data<PartnerOnboardingActionData>(
    { error: result.code ?? result.error ?? 'UNKNOWN' },
    { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
  );
}

/**
 * Server-side flow accessor. The returned record may contain a completion token,
 * so route loaders must expose it only through `requirePartnerView`.
 */
export async function requirePartnerPhase(
  request: Request,
  phase: AuthFlowPhase,
  locale: Locale,
) {
  const flow = await authFlow.read(request);
  if (!flow || flow.record.phase !== phase) throw redirect(partnerStartPath(locale));
  return {
    ...flow,
    resendAfterSec: Math.max(
      0,
      Math.ceil(((flow.record.resendAvailableAt ?? Date.now()) - Date.now()) / 1_000),
    ),
  };
}

export async function requirePartnerView(
  request: Request,
  phase: AuthFlowPhase,
  locale: Locale,
): Promise<AuthFlowView> {
  return flowView(await requirePartnerPhase(request, phase, locale));
}

export async function requirePartnerPhaseOnly(
  request: Request,
  phase: AuthFlowPhase,
  locale: Locale,
): Promise<null> {
  await requirePartnerPhase(request, phase, locale);
  return null;
}
