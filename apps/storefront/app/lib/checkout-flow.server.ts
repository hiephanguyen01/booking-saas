import { randomUUID } from 'node:crypto';
import { createCookie } from 'react-router';
import { storefrontEnv } from './env.server';
import { storefrontRedisStore, type RedisJsonStore } from './redis-store.server';

const TTL_SECONDS = 30 * 60;
const MAX_ACTIVE_FLOWS = 5;
const PREFIX = 'bookify:storefront:checkout-flow:';

export interface CheckoutFlowRecord {
  bookingId: string;
  bookingCode: string;
  listingSlug: string;
  locale: 'vi' | 'en';
  /** Checkout contact email masked before storage and safe to expose in the success UI. */
  maskedEmail?: string;
}

interface CheckoutFlowCookieEntry {
  id: string;
  bookingCode: string;
  /** Opaque API bearer grant. HttpOnly, signed cookie only; never loader or URL data. */
  accessGrant?: string;
}

interface StoredCheckoutFlowRecord extends CheckoutFlowRecord {
  /** Backward compatibility for flows created before access grants were introduced. */
  otp?: string;
}

export interface CheckoutFlowRead {
  id: string;
  accessGrant?: string;
  legacyOtp?: string;
  record: CheckoutFlowRecord | null;
}

export function maskCheckoutEmail(email: string): string {
  const normalized = email.trim();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1) return '***';

  const localPart = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
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

  async function entriesFrom(request: Request): Promise<CheckoutFlowCookieEntry[]> {
    const parsed: unknown = await cookie.parse(request.headers.get('Cookie'));
    if (typeof parsed === 'string' && parsed) {
      return [{ id: parsed, bookingCode: '' }];
    }
    if (!Array.isArray(parsed)) return [];

    const entries = parsed.flatMap((value): CheckoutFlowCookieEntry[] => {
      if (!value || typeof value !== 'object') return [];
      const candidate = value as Partial<CheckoutFlowCookieEntry>;
      if (typeof candidate.id !== 'string' || !candidate.id) return [];
      if (typeof candidate.bookingCode !== 'string') return [];
      return [
        {
          id: candidate.id,
          bookingCode: candidate.bookingCode,
          ...(typeof candidate.accessGrant === 'string' && candidate.accessGrant
            ? { accessGrant: candidate.accessGrant }
            : {}),
        },
      ];
    });

    return entries.slice(0, MAX_ACTIVE_FLOWS);
  }

  async function readRecord(id: string): Promise<StoredCheckoutFlowRecord | null> {
    try {
      return await store.get<StoredCheckoutFlowRecord>(`${PREFIX}${id}`);
    } catch {
      // The access grant lives in the signed cookie, so payment polling can still
      // authorize against the API while optional Redis-backed UI metadata degrades.
      return null;
    }
  }

  async function writeRecord(id: string, record: CheckoutFlowRecord): Promise<void> {
    try {
      await store.set(`${PREFIX}${id}`, record, TTL_SECONDS);
    } catch {
      // Redis stores display/retry metadata only. Do not fail a booking that the
      // API already created; the signed cookie grant remains enough to authorize.
    }
  }

  return {
    async readForCode(request: Request, bookingCode: string): Promise<CheckoutFlowRead | null> {
      const normalizedCode = bookingCode.trim().toUpperCase();
      const entries = await entriesFrom(request);
      const direct = entries.find((entry) => entry.bookingCode === normalizedCode);
      if (direct) {
        const record = await readRecord(direct.id);
        return {
          id: direct.id,
          accessGrant: direct.accessGrant,
          legacyOtp: record?.otp,
          record: record?.bookingCode === normalizedCode ? record : null,
        };
      }

      // A pre-migration cookie held only one Redis id and no booking-code index.
      for (const entry of entries.filter((candidate) => !candidate.bookingCode)) {
        const record = await readRecord(entry.id);
        if (record?.bookingCode === normalizedCode) {
          return {
            id: entry.id,
            accessGrant: entry.accessGrant,
            legacyOtp: record.otp,
            record,
          };
        }
      }
      return null;
    },

    async create(
      request: Request,
      record: CheckoutFlowRecord,
      accessGrant?: string,
    ): Promise<string> {
      const normalizedRecord = {
        ...record,
        bookingCode: record.bookingCode.trim().toUpperCase(),
      };
      const existing = await entriesFrom(request);
      const id = randomUUID();
      await writeRecord(id, normalizedRecord);

      const replaced = existing.filter(
        (entry) => entry.bookingCode === normalizedRecord.bookingCode || entry.id === id,
      );
      const candidates = [
        { id, bookingCode: normalizedRecord.bookingCode, ...(accessGrant ? { accessGrant } : {}) },
        ...existing.filter(
          (entry) => entry.bookingCode !== normalizedRecord.bookingCode && entry.id !== id,
        ),
      ];
      const retained = candidates.slice(0, MAX_ACTIVE_FLOWS);
      const retainedIds = new Set(retained.map((entry) => entry.id));
      const evicted = [...replaced, ...candidates.slice(MAX_ACTIVE_FLOWS)].filter(
        (entry) => !retainedIds.has(entry.id),
      );
      await Promise.allSettled(evicted.map((entry) => store.delete(`${PREFIX}${entry.id}`)));
      return cookie.serialize(retained);
    },

    async destroy(request: Request, bookingCode?: string): Promise<string> {
      const entries = await entriesFrom(request);
      const normalizedCode = bookingCode?.trim().toUpperCase();
      const removed = normalizedCode
        ? entries.filter((entry) => entry.bookingCode === normalizedCode)
        : entries;
      const retained = normalizedCode
        ? entries.filter((entry) => entry.bookingCode !== normalizedCode)
        : [];
      await Promise.allSettled(removed.map((entry) => store.delete(`${PREFIX}${entry.id}`)));
      return retained.length
        ? cookie.serialize(retained)
        : cookie.serialize('', { expires: new Date(0), maxAge: 0 });
    },
  };
}

export type CheckoutFlowService = ReturnType<typeof createCheckoutFlowService>;
let singleton: CheckoutFlowService | undefined;
export const getCheckoutFlowService = () => (singleton ??= createCheckoutFlowService());
