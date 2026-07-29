import { data } from 'react-router';
import type { AuthActionData } from '~/lib/auth-types';
import {
  formRequestFailureStatus,
  readFormRequestBody,
  type FormRequestBody,
} from '~/lib/server/form-request.server';

/**
 * The form-reading and error-shaping quartet every OTP-flow action uses.
 *
 * Customer auth and partner onboarding walk the same three-step flow on the same
 * `auth-flow.server` store, and each had written these four helpers out
 * separately — same byte limit, same 400 payload, same status clamp.
 */
export const AUTH_MAX_FORM_BYTES = 16 * 1024;

export const formFields = (form: FormData) => Object.fromEntries(form.entries());

export const readAuthForm = (request: Request) => readFormRequestBody(request, AUTH_MAX_FORM_BYTES);

/** 400 carrying only the fields that actually failed. */
export function invalidAuthInput(fieldErrors: Record<string, string[] | undefined>) {
  return data<AuthActionData>(
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

/** Surfaces a backend problem code, clamping anything outside 4xx/5xx to 500. */
export function failedAuthRequest(result: { status: number; code?: string; error?: string }) {
  return data<AuthActionData>(
    { error: result.code ?? result.error ?? 'UNKNOWN' },
    { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
  );
}

export const failedAuthForm = (result: Extract<FormRequestBody, { ok: false }>) =>
  failedAuthRequest({ status: formRequestFailureStatus(result.code), code: result.code });
