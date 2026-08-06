/**
 * How one recently-viewed entry is named.
 *
 * The format is shared, not server-only: the cookie module writes these keys
 * and the account page submits one back to remove an entry. Keeping it here
 * lets both sides import the same encoder — a browser module cannot value-import
 * a `*.server` file.
 */
export interface ViewedRef {
  kind: 'listing' | 'group';
  slug: string;
}

/** `l:<slug>` for a listing, `g:<slug>` for a listing group. */
export const VIEWED_REF_KEY_RE = /^[lg]:[a-z0-9-]{1,120}$/;

export function viewedRefKey({ kind, slug }: ViewedRef): string {
  return `${kind === 'group' ? 'g' : 'l'}:${slug}`;
}

export function parseViewedRefKey(key: string): ViewedRef | null {
  if (!VIEWED_REF_KEY_RE.test(key)) return null;
  return { kind: key.startsWith('g:') ? 'group' : 'listing', slug: key.slice(2) };
}
