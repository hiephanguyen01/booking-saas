export const DEFAULT_MAX_JSON_REQUEST_BYTES = 64 * 1024;

export type JsonRequestBody =
  { ok: true; value: unknown } | { ok: false; code: 'INVALID_JSON' | 'PAYLOAD_TOO_LARGE' };

interface JsonReadableRequest {
  body?: ReadableStream<Uint8Array> | null;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

function declaredContentLength(request: JsonReadableRequest): number | null {
  const raw = request.headers?.get('content-length')?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;

  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : Number.POSITIVE_INFINITY;
}

async function readBodyBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | null> {
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
  return bodyBytes;
}

function parseJsonText(text: string): JsonRequestBody {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, code: 'INVALID_JSON' };
    throw error;
  }
}

export async function readJsonRequestBody(
  request: JsonReadableRequest,
  maxBytes = DEFAULT_MAX_JSON_REQUEST_BYTES,
): Promise<JsonRequestBody> {
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
    return parseJsonText(new TextDecoder().decode(bodyBytes));
  }

  // Keep the fallback for lightweight request doubles that only implement json().
  try {
    return { ok: true, value: await request.json() };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, code: 'INVALID_JSON' };
    throw error;
  }
}
