import {
  assertPositiveByteLimit,
  exceedsDeclaredLength,
  readLimitedBody,
  requestBodyFailureStatus,
  type BodyReadableRequest,
} from './request-body.server';

export const DEFAULT_MAX_FORM_REQUEST_BYTES = 32 * 1024;

export type FormRequestBody =
  { ok: true; value: FormData } | { ok: false; code: 'INVALID_FORM_DATA' | 'PAYLOAD_TOO_LARGE' };

export type FormRequestFailureCode = Extract<FormRequestBody, { ok: false }>['code'];

interface FormReadableRequest extends BodyReadableRequest {
  formData(): Promise<FormData>;
}

function invalidFormData(error: unknown): FormRequestBody {
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return { ok: false, code: 'INVALID_FORM_DATA' };
  }
  throw error;
}

async function parseFormBytes(
  bodyBytes: ArrayBuffer,
  contentType: string | null,
): Promise<FormRequestBody> {
  if (!contentType) return { ok: false, code: 'INVALID_FORM_DATA' };

  try {
    // Re-reading the bytes through Response is what gives us multipart parsing.
    const response = new Response(bodyBytes, {
      headers: { 'Content-Type': contentType },
    });
    return { ok: true, value: await response.formData() };
  } catch (error) {
    return invalidFormData(error);
  }
}

export function formRequestFailureStatus(code: FormRequestFailureCode): 400 | 413 {
  return requestBodyFailureStatus(code);
}

export async function readFormRequestBody(
  request: FormReadableRequest,
  maxBytes = DEFAULT_MAX_FORM_REQUEST_BYTES,
): Promise<FormRequestBody> {
  assertPositiveByteLimit(maxBytes);
  if (exceedsDeclaredLength(request, maxBytes)) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };

  if (request.body) {
    const bodyBytes = await readLimitedBody(request.body, maxBytes);
    if (!bodyBytes) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
    return parseFormBytes(bodyBytes, request.headers?.get('content-type') ?? null);
  }

  // Keep the fallback for lightweight request doubles that only implement formData().
  try {
    return { ok: true, value: await request.formData() };
  } catch (error) {
    return invalidFormData(error);
  }
}
