/**
 * Size-bounded request-body reading, shared by the JSON and form readers.
 *
 * Both need the same two guards before they may parse anything: refuse a
 * `Content-Length` that already exceeds the limit, and stop reading the stream
 * the moment the bytes do. Keeping one implementation is what stops the two
 * limits from drifting apart.
 */

export type RequestBodyFailureCode = 'PAYLOAD_TOO_LARGE' | 'INVALID_JSON' | 'INVALID_FORM_DATA';

export interface BodyReadableRequest {
  body?: ReadableStream<Uint8Array> | null;
  headers?: { get(name: string): string | null };
}

/** 413 for a body that was too big, 400 for one we could not parse. */
export function requestBodyFailureStatus(code: RequestBodyFailureCode): 400 | 413 {
  return code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
}

export function assertPositiveByteLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('maxBytes must be a positive safe integer');
  }
}

/** `true` when the declared length alone already exceeds the limit. */
export function exceedsDeclaredLength(request: BodyReadableRequest, maxBytes: number): boolean {
  const raw = request.headers?.get('content-length')?.trim();
  if (!raw || !/^\d+$/.test(raw)) return false;

  const length = Number(raw);
  return (Number.isSafeInteger(length) ? length : Number.POSITIVE_INFINITY) > maxBytes;
}

/**
 * The body's bytes, or `null` as soon as it grows past `maxBytes`.
 *
 * Returned as an `ArrayBuffer` because that is what both consumers accept
 * directly — `TextDecoder` for JSON, `Response` for multipart form data.
 */
export async function readLimitedBody(
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

  const bodyBytes = new Uint8Array(new ArrayBuffer(totalBytes));
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bodyBytes.buffer;
}
