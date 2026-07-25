import { randomUUID } from 'node:crypto';
import type { CustomerPaymentMethod } from '@booking/contracts';
import { createCookie } from 'react-router';
import { storefrontRedisStore, type RedisJsonStore } from './redis-store.server';
import { storefrontEnv } from './env.server';

const TTL_SECONDS = 30 * 60;
const PREFIX = 'bookify:storefront:checkout-flow:';

export interface CheckoutFlowRecord {
  bookingId: string;
  bookingCode: string;
  listingSlug: string;
  locale: 'vi' | 'en';
  /** Checkout contact email masked before storage and safe to expose in the success UI. */
  maskedEmail?: string;
  /** Provider-neutral method selected for the initial payment attempt. */
  paymentMethod?: CustomerPaymentMethod;
  /** Guest access credential; Redis-only and never serialized into a URL or loader payload. */
  otp?: string;
}

export function maskCheckoutEmail(email: string): string {
  const [localPart = '', domain = ''] = email.split('@');
  const visibleLength = Math.min(2, localPart.length);
  const visible = localPart.slice(0, visibleLength);
  const hidden = '*'.repeat(Math.max(3, localPart.length - visibleLength));
  return `${visible}${hidden}@${domain}`;
}

export function createCheckoutFlowService(store: RedisJsonStore = storefrontRedisStore) {
  const cookie = createCookie('__storefront_checkout_flow', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: storefrontEnv.secureCookies,
    secrets: [...storefrontEnv.sessionSecrets],
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
