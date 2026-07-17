import { getOptionalAccessToken } from './auth.server';
import { storefrontEnv } from './env.server';

export interface PublicJsonOptions {
  allowNotFound?: boolean;
  fetchImplementation?: typeof fetch;
}


interface NullablePublicJsonOptions extends PublicJsonOptions {
  allowNotFound: true;
}

const backendUrl = (): string => storefrontEnv.backendUrl;

function forwardedHost(request: Request): string {
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

export function requestPublicJson<T>(
  request: Request,
  path: string,
  options: NullablePublicJsonOptions,
): Promise<T | null>;
export function requestPublicJson<T>(
  request: Request,
  path: string,
  options?: PublicJsonOptions,
): Promise<T>;
export async function requestPublicJson<T>(
  request: Request,
  path: string,
  options: PublicJsonOptions = {},
): Promise<T | null> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  let response: Response;

  try {
    response = await fetchImplementation(`${backendUrl()}${path}`, {
      headers: {
        'x-forwarded-host': forwardedHost(request),
        accept: 'application/json',
        ...(getOptionalAccessToken() ? { cookie: `sid=${getOptionalAccessToken()}` } : {}),
      },
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    throw new Response('Storefront API unavailable', { status: 503 });
  }

  if (response.status === 404 && options.allowNotFound) return null;

  if (!response.ok) {
    throw new Response('Storefront API request failed', {
      status: response.status >= 500 ? 503 : response.status,
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Response('Storefront API returned invalid JSON', { status: 502 });
  }
}
