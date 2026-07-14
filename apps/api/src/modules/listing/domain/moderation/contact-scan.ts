import type { ContactFlag } from '@booking/contracts';

/**
 * Contact-info scanner (TONG-QUAN.md §7.3 — anti-disintermediation). A partner
 * pulling customers off-platform to dodge commission is the #1 marketplace risk,
 * so listing text is scanned for phone numbers, "Zalo", emails and external
 * links at review time. Pure + deterministic so it is unit-testable and can run
 * inside a tenant transaction with no side effects.
 */

// A Vietnamese phone number: +84 / 84 / 0 prefix then 9–10 more digits, allowing
// spaces, dots or dashes as separators. Validated by digit count after stripping.
const PHONE_CANDIDATE = /(?:\+?84|0)[\d\s._-]{8,13}\d/g;
const ZALO = /zalo/gi;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// http(s):// or www. links, plus bare domains on common TLDs (fb.com, t.me, …).
const URL =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|vn|net|org|me|link|info|biz|fb|ig|tk|xyz)\b(?:\/\S*)?/gi;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** True when a candidate string is a plausible VN phone number. */
function isPhone(candidate: string): boolean {
  const d = digitsOnly(candidate);
  if (d.startsWith('84')) return d.length === 11 || d.length === 12;
  if (d.startsWith('0')) return d.length === 10 || d.length === 11;
  return false;
}

function scanField(field: string, text: string | null | undefined): ContactFlag[] {
  if (!text) return [];
  const flags: ContactFlag[] = [];

  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    const match = m[0].trim();
    if (isPhone(match)) flags.push({ type: 'phone', field, match });
  }
  for (const m of text.matchAll(EMAIL)) {
    flags.push({ type: 'email', field, match: m[0] });
  }
  // A URL match that is really just an email's domain would double-report; skip
  // links already covered by an email hit on the same field.
  const emailMatches = flags.filter((f) => f.type === 'email').map((f) => f.match.toLowerCase());
  for (const m of text.matchAll(URL)) {
    const match = m[0];
    if (emailMatches.some((e) => e.includes(match.toLowerCase()))) continue;
    flags.push({ type: 'url', field, match });
  }
  for (const m of text.matchAll(ZALO)) {
    flags.push({ type: 'zalo', field, match: m[0] });
  }

  return flags;
}

/**
 * Scan a set of named text fields (description, title, image alt/metadata) and
 * return every contact-info hit. An empty array means the listing is clean.
 */
export function scanForContactInfo(
  fields: Readonly<Record<string, string | null | undefined>>,
): ContactFlag[] {
  return Object.entries(fields).flatMap(([field, text]) => scanField(field, text));
}

/**
 * Turn a listing/post photo list into named scan fields. §7.3 mandates scanning
 * "description/images metadata", so a phone number smuggled into an image URL,
 * filename or alt text (e.g. `call-0901234567.jpg`) is caught like prose is.
 */
export function photoScanFields(
  photos: readonly string[] | null | undefined,
): Record<string, string> {
  const fields: Record<string, string> = {};
  (photos ?? []).forEach((photo, index) => {
    fields[`photo[${index}]`] = photo;
  });
  return fields;
}
