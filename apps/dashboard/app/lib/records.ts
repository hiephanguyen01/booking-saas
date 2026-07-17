/**
 * Small, pure readers for **untrusted jsonb** columns (listing `modeConfig`,
 * partner `businessInfo`, tenant `theme`/`settings`, …). Each narrows an
 * `unknown` to a concrete type or a null miss, so a route never trusts the raw
 * shape of a jsonb blob. Client-safe — no framework imports.
 *
 * Note on conventions: these return `null` on a miss. Call sites that build a
 * form's `defaultValues` need `''`/`undefined` instead (a controlled input
 * can't take `null`), so those keep their own local reader — do not migrate
 * them here without checking the return contract.
 */

/** Narrow an unknown to a plain object (not an array), else `null`. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Trimmed non-empty string, else `null`. */
export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A valid `http(s)` URL string (normalised), else `null`. */
export function readHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A finite number, else `null`. */
export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// `…U` variants return `undefined` on a miss — for building a form's
// `defaultValues` (a controlled input can't take `null`; see the note above).

/** Trimmed non-empty string, else `undefined`. */
export function readStringU(value: unknown): string | undefined {
  return readString(value) ?? undefined;
}

/** A boolean, else `undefined`. */
export function readBooleanU(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
