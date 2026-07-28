import { storefrontEnv } from '~/lib/server/env.server';
import { storefrontRedisStore } from '~/lib/server/redis-store.server';

const READY_TIMEOUT_MS = 2_000;

export async function readStorefrontReadiness(): Promise<Response> {
  const [backend, redis] = await Promise.allSettled([
    withinReadinessTimeout(backendReady()),
    withinReadinessTimeout(storefrontRedisStore.ping()),
  ]);
  const result = {
    status: backend.status === 'fulfilled' && redis.status === 'fulfilled' ? 'ok' : 'not_ready',
    backend: backend.status === 'fulfilled' ? 'up' : 'down',
    redis: redis.status === 'fulfilled' ? 'up' : 'down',
  } as const;

  return Response.json(result, {
    status: result.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function withinReadinessTimeout(operation: Promise<void>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Readiness dependency timed out')),
      READY_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function backendReady(): Promise<void> {
  const response = await fetch(new URL('/health/ready', storefrontEnv.backendUrl), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(READY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Backend readiness returned ${response.status}`);
}
