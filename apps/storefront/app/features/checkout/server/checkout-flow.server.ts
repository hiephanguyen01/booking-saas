import { randomUUID } from 'node:crypto';
import { bookingAccessGrantSchema, type CustomerPaymentMethod } from '@booking/contracts';
import { createCookie } from 'react-router';
import { storefrontEnv } from '~/lib/server/env.server';
import { storefrontRedisStore, type RedisJsonStore } from '~/lib/server/redis-store.server';

const TTL_SECONDS = 30 * 60;
const MAX_ACTIVE_FLOWS = 5;
const PREFIX = 'bookingos:storefront:checkout-flow:';

export interface CheckoutFlowRecord {
  bookingId: string;
  bookingCode: string;
  listingSlug: string;
  locale: 'vi' | 'en';
  /** Checkout contact email masked before storage and safe to expose in the success UI. */
  maskedEmail?: string;
  /** Provider-neutral method selected for the initial payment attempt. */
  paymentMethod?: CustomerPaymentMethod;
}

interface StoredCheckoutFlowRecord extends CheckoutFlowRecord {
  /** Backward compatibility for flows created before access grants were introduced. */
  otp?: string;
}

interface CheckoutFlowCookieEntry {
  id: string;
  bookingCode: string;
  /** Opaque API bearer grant; signed + HttpOnly and never returned in loader data. */
  accessGrant?: string;
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
    let parsed: unknown;
    try {
      parsed = await cookie.parse(request.headers.get('Cookie'));
    } catch {
      return [];
    }

    if (typeof parsed === 'string' && parsed) {
      return [{ id: parsed, bookingCode: '' }];
    }
    if (!Array.isArray(parsed)) return [];

    return parsed
      .flatMap((value): CheckoutFlowCookieEntry[] => {
        if (!value || typeof value !== 'object') return [];
        const candidate = value as Partial<CheckoutFlowCookieEntry>;
        if (typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 128) {
          return [];
        }
        if (typeof candidate.bookingCode !== 'string' || candidate.bookingCode.length > 32) {
          return [];
        }
        const accessGrant = bookingAccessGrantSchema.safeParse(candidate.accessGrant);
        return [
          {
            id: candidate.id,
            bookingCode: candidate.bookingCode.trim().toUpperCase(),
            ...(accessGrant.success ? { accessGrant: accessGrant.data } : {}),
          },
        ];
      })
      .slice(0, MAX_ACTIVE_FLOWS);
  }

  async function readRecord(id: string): Promise<StoredCheckoutFlowRecord | null> {
    try {
      return await store.get<StoredCheckoutFlowRecord>(`${PREFIX}${id}`);
    } catch {
      // Access authorization lives in the signed cookie; Redis only enriches UI/retry metadata.
      return null;
    }
  }

  async function writeRecord(id: string, record: CheckoutFlowRecord): Promise<void> {
    try {
      await store.set(`${PREFIX}${id}`, record, TTL_SECONDS);
    } catch {
      // Do not fail a booking already created by the API because optional UI metadata is unavailable.
    }
  }

  function withoutLegacyOtp(record: StoredCheckoutFlowRecord): CheckoutFlowRecord {
    const safeRecord = { ...record };
    delete safeRecord.otp;
    return safeRecord;
  }

  async function entryMatchesCode(
    entry: CheckoutFlowCookieEntry,
    normalizedCode: string,
  ): Promise<boolean> {
    if (entry.bookingCode) return entry.bookingCode === normalizedCode;
    const record = await readRecord(entry.id);
    return record?.bookingCode.trim().toUpperCase() === normalizedCode;
  }

  return {
    async readForCode(request: Request, bookingCode: string): Promise<CheckoutFlowRead | null> {
      const normalizedCode = bookingCode.trim().toUpperCase();
      const entries = await entriesFrom(request);
      const direct = entries.find((entry) => entry.bookingCode === normalizedCode);
      if (direct) {
        const stored = await readRecord(direct.id);
        return {
          id: direct.id,
          accessGrant: direct.accessGrant,
          legacyOtp: stored?.otp,
          record:
            stored?.bookingCode.trim().toUpperCase() === normalizedCode
              ? withoutLegacyOtp(stored)
              : null,
        };
      }

      for (const entry of entries.filter((candidate) => !candidate.bookingCode)) {
        const stored = await readRecord(entry.id);
        if (stored?.bookingCode.trim().toUpperCase() === normalizedCode) {
          return {
            id: entry.id,
            accessGrant: entry.accessGrant,
            legacyOtp: stored.otp,
            record: withoutLegacyOtp(stored),
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

      const grant = bookingAccessGrantSchema.safeParse(accessGrant);
      const nextEntry: CheckoutFlowCookieEntry = {
        id,
        bookingCode: normalizedRecord.bookingCode,
        ...(grant.success ? { accessGrant: grant.data } : {}),
      };
      const candidates = [
        nextEntry,
        ...existing.filter((entry) => entry.bookingCode !== normalizedRecord.bookingCode),
      ];
      const retained = candidates.slice(0, MAX_ACTIVE_FLOWS);
      const retainedIds = new Set(retained.map((entry) => entry.id));
      const evicted = existing.filter((entry) => !retainedIds.has(entry.id));
      await Promise.allSettled(evicted.map((entry) => store.delete(`${PREFIX}${entry.id}`)));

      return cookie.serialize(retained);
    },

    async destroy(request: Request, bookingCode?: string): Promise<string> {
      const entries = await entriesFrom(request);
      const normalizedCode = bookingCode?.trim().toUpperCase();
      const matches = normalizedCode
        ? await Promise.all(entries.map((entry) => entryMatchesCode(entry, normalizedCode)))
        : entries.map(() => true);
      const removed = entries.filter((_, index) => matches[index]);
      const retained = entries.filter((_, index) => !matches[index]);
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
