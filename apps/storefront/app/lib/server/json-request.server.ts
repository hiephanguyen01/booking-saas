import {
  assertPositiveByteLimit,
  exceedsDeclaredLength,
  readLimitedBody,
  type BodyReadableRequest,
} from './request-body.server';

export const DEFAULT_MAX_JSON_REQUEST_BYTES = 64 * 1024;

export type JsonRequestBody =
  { ok: true; value: unknown } | { ok: false; code: 'INVALID_JSON' | 'PAYLOAD_TOO_LARGE' };

interface JsonReadableRequest extends BodyReadableRequest {
  json(): Promise<unknown>;
}

function invalidJson(error: unknown): JsonRequestBody {
  if (error instanceof SyntaxError) return { ok: false, code: 'INVALID_JSON' };
  throw error;
}

export async function readJsonRequestBody(
  request: JsonReadableRequest,
  maxBytes = DEFAULT_MAX_JSON_REQUEST_BYTES,
): Promise<JsonRequestBody> {
  assertPositiveByteLimit(maxBytes);
  if (exceedsDeclaredLength(request, maxBytes)) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };

  if (request.body) {
    const bodyBytes = await readLimitedBody(request.body, maxBytes);
    if (!bodyBytes) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
    try {
      return { ok: true, value: JSON.parse(new TextDecoder().decode(bodyBytes)) as unknown };
    } catch (error) {
      return invalidJson(error);
    }
  }

  // Keep the fallback for lightweight request doubles that only implement json().
  try {
    return { ok: true, value: await request.json() };
  } catch (error) {
    return invalidJson(error);
  }
}
