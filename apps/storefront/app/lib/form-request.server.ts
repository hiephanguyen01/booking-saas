export const DEFAULT_MAX_FORM_REQUEST_BYTES = 32 * 1024;

export type FormRequestBody =
  | { ok: true; value: FormData }
  | { ok: false; code: 'INVALID_FORM_DATA' | 'PAYLOAD_TOO_LARGE' };

export type FormRequestFailureCode = Extract<FormRequestBody, { ok: false }>['code'];

interface FormReadableRequest {
  body?: ReadableStream<Uint8Array> | null;
  headers?: { get(name: string): string | null };
  formData(): Promise<FormData>;
}

function declaredContentLength(request: FormReadableRequest): number | null {
  const raw = request.headers?.get('content-length')?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;

  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : Number.POSITIVE_INFINITY;
}

async function readBodyBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bodyBytes.buffer;
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
    const response = new Response(bodyBytes, {
      headers: { 'Content-Type': contentType },
    });
    return { ok: true, value: await response.formData() };
  } catch (error) {
    return invalidFormData(error);
  }
}

export function formRequestFailureStatus(code: FormRequestFailureCode): 400 | 413 {
  return code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
}

export async function readFormRequestBody(
  request: FormReadableRequest,
  maxBytes = DEFAULT_MAX_FORM_REQUEST_BYTES,
): Promise<FormRequestBody> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('maxBytes must be a positive safe integer');
  }

  const contentLength = declaredContentLength(request);
  if (contentLength !== null && contentLength > maxBytes) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  }

  if (request.body) {
    const bodyBytes = await readBodyBytes(request.body, maxBytes);
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
