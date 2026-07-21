import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import type { EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';
import { renderToPipeableStream, type RenderToPipeableStreamOptions } from 'react-dom/server';
import { storefrontEnv } from './lib/env.server';
import { storefrontLogError } from './lib/logger.server';

export const streamTimeout = 10_000;

function contentSecurityPolicy(nonce: string): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(!storefrontEnv.production ? ["'unsafe-eval'"] : []),
  ];
  const connectSources = [
    "'self'",
    ...(!storefrontEnv.production ? ['ws:', 'wss:'] : []),
  ];
  const imageSources = [
    "'self'",
    'data:',
    'blob:',
    'https:',
    ...(!storefrontEnv.production ? ['http:'] : []),
  ];
  const formActions = ["'self'", ...storefrontEnv.paymentRedirectOrigins];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `form-action ${formActions.join(' ')}`,
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    ...(storefrontEnv.production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const nonce = randomBytes(18).toString('base64');
    const userAgent = request.headers.get('user-agent');
    const readyOption: 'onAllReady' | 'onShellReady' =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          responseHeaders.set('Content-Type', 'text/html');
          responseHeaders.set('Content-Security-Policy', contentSecurityPolicy(nonce));

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            storefrontLogError('ssr.stream_render_failed', error, {
              requestPath: new URL(request.url).pathname,
            });
          }
        },
      } satisfies RenderToPipeableStreamOptions,
    );

    setTimeout(abort, streamTimeout + 1_000);
  });
}

export function handleError(error: unknown, { request }: { request: Request }): void {
  if (request.signal.aborted) return;
  storefrontLogError('ssr.request_failed', error, {
    requestPath: new URL(request.url).pathname,
  });
}