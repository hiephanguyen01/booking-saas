import { randomUUID } from 'node:crypto';
import { createCookie } from 'react-router';
import { storefrontRedisStore, type RedisJsonStore } from './redis-store.server';

const TTL_SECONDS = 30 * 60;
const PREFIX = 'bookify:storefront:checkout-flow:';

export interface CheckoutFlowRecord {
  bookingId: string;
  bookingCode: string;
  listingSlug: string;
  locale: 'vi' | 'en';
}

function sessionSecrets(): string[] {
  const current = process.env.SESSION_SECRET_CURRENT ?? process.env.SESSION_SECRET;
  if (!current || current.length < 32) {
    throw new Error('SESSION_SECRET_CURRENT must contain at least 32 characters.');
  }
  return [current, process.env.SESSION_SECRET_PREVIOUS].filter(
    (value): value is string => Boolean(value && value.length >= 32),
  );
}

export function createCheckoutFlowService(store: RedisJsonStore = storefrontRedisStore) {
  const cookie = createCookie('__storefront_checkout_flow', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.SESSION_COOKIE_SECURE
      ? process.env.SESSION_COOKIE_SECURE !== 'false'
      : process.env.NODE_ENV === 'production',
    secrets: sessionSecrets(),
    maxAge: TTL_SECONDS,
  });

  async function idFrom(request: Request): Promise<string | null> {
    const id: unknown = await cookie.parse(request.headers.get('Cookie'));
    return typeof id === 'string' && id ? id : null;
  }

  return {
    async readForCode(
      request: Request,
      bookingCode: string,
    ): Promise<{ id: string; record: CheckoutFlowRecord } | null> {
      const id = await idFrom(request);
      if (!id) return null;
      const record = await store.get<CheckoutFlowRecord>(`${PREFIX}${id}`);
      if (!record || record.bookingCode !== bookingCode) return null;
      return { id, record };
    },

    async create(request: Request, record: CheckoutFlowRecord): Promise<string> {
      const previous = await idFrom(request);
      if (previous) await store.delete(`${PREFIX}${previous}`);
      const id = randomUUID();
      await store.set(`${PREFIX}${id}`, record, TTL_SECONDS);
      return cookie.serialize(id);
    },

    async destroy(request: Request): Promise<string> {
      const id = await idFrom(request);
      if (id) await store.delete(`${PREFIX}${id}`);
      return cookie.serialize('', { expires: new Date(0), maxAge: 0 });
    },
  };
}

export type CheckoutFlowService = ReturnType<typeof createCheckoutFlowService>;
let singleton: CheckoutFlowService | undefined;
export const getCheckoutFlowService = () => (singleton ??= createCheckoutFlowService());
