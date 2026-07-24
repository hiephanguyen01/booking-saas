export type JsonRequestBody =
  | { ok: true; value: unknown }
  | { ok: false; code: 'INVALID_JSON' };

interface JsonReadableRequest {
  json(): Promise<unknown>;
}

export async function readJsonRequestBody(request: JsonReadableRequest): Promise<JsonRequestBody> {
  try {
    return { ok: true, value: await request.json() };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, code: 'INVALID_JSON' };
    throw error;
  }
}
