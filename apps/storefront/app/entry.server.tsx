import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext, type RouterContextProvider } from 'react-router';
import { storefrontCspNonceContext } from './lib/security-context.server';

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
): Promise<Response> | Response {
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  const cspNonce = loadContext.get(storefrontCspNonceContext);

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let responseSettled = false;
    let body: PassThrough | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortRender: () => void = () => undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      request.signal.removeEventListener('abort', handleRequestAbort);
    };

    const failBeforeShell = (error: Error) => {
      if (responseSettled) return;
      responseSettled = true;
      cleanup();
      reject(error);
    };

    const handleRequestAbort = () => {
      const error =
        request.signal.reason instanceof Error
          ? request.signal.reason
          : new Error('Storefront SSR request aborted');
      abortRender();
      body?.destroy(error);
      if (shellRendered) cleanup();
      else failBeforeShell(error);
    };

    const userAgent = request.headers.get('user-agent');
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

    const rendered = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={cspNonce} />,
      {
        nonce: cspNonce,
        [readyOption]() {
          if (responseSettled) return;
          if (request.signal.aborted) {
            handleRequestAbort();
            return;
          }

          shellRendered = true;
          body = new PassThrough({
            final(callback) {
              cleanup();
              callback();
            },
          });
          body.once('close', cleanup);
          body.once('error', cleanup);

          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set('Content-Type', 'text/html');
          rendered.pipe(body);
          responseSettled = true;
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          failBeforeShell(
            error instanceof Error ? error : new Error('Storefront SSR shell failed'),
          );
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
    abortRender = rendered.abort;

    request.signal.addEventListener('abort', handleRequestAbort, { once: true });
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      abortRender();
      if (!shellRendered) failBeforeShell(new Error('Storefront SSR render timed out'));
    }, streamTimeout + 1_000);

    if (request.signal.aborted) handleRequestAbort();
  });
}
