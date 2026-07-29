/**
 * Builds a promotion input object from submitted form data.
 *
 * Blank *conditions* (`maxDiscount`, `minOrderAmount`, both usage limits, `timeWindows`)
 * submit as **explicit `null`, not `undefined`** — this form renders the promotion's whole
 * condition set every time, so a field the user emptied means "remove this condition". The
 * server reads `undefined` as "leave alone", so sending `undefined` here is what made a cap
 * or limit impossible to clear once set. On create, `null` is simply "no condition".
 */
export function readPromotionForm(form: FormData): Record<string, unknown> {
  const str = (k: string) => {
    const v = form.get(k);
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? undefined : s;
  };
  /** A clearable condition: blank → null (clear it), never undefined (leave alone). */
  const clearableStr = (k: string) => str(k) ?? null;
  const clearableNum = (k: string) => {
    const s = str(k);
    return s === undefined ? null : Number(s);
  };
  /**
   * A clearable date bound: blank → null (clear it). The `type="date"` input submits a
   * `YYYY-MM-DD` string, which we widen to a UTC-midnight ISO instant (`.datetime()` on the
   * shared schema requires a `Z` offset). Concatenating the `Z` — rather than `new Date(...)`
   * — keeps the value timezone-stable regardless of where the action runs.
   */
  const clearableDate = (k: string) => {
    const s = str(k);
    return s === undefined ? null : `${s}T00:00:00.000Z`;
  };
  const isAuto = form.get('isAuto') === 'true';

  // Blank / unparseable → null: an empty editor means "no off-peak windows" (always applicable).
  let timeWindows: unknown = null;
  const rawWindows = str('timeWindows');
  if (rawWindows) {
    try {
      timeWindows = JSON.parse(rawWindows);
    } catch {
      timeWindows = null;
    }
  }

  return {
    name: str('name'),
    // Explicit null → auto-campaign (also clears an existing code on update).
    code: isAuto ? null : str('code'),
    discountType: str('discountType'),
    discountValue: str('discountValue'),
    // Note: the cap input only renders for a `percent` discount, so switching to `fixed`
    // submits it blank — which correctly clears a cap that no longer has any meaning.
    maxDiscount: clearableStr('maxDiscount'),
    fundedBy: str('fundedBy'),
    appliesTo: str('appliesTo'),
    appliesToId: str('appliesToId'),
    minOrderAmount: clearableStr('minOrderAmount'),
    firstBookingOnly: form.get('firstBookingOnly') === 'true',
    storefrontVisible: form.get('storefrontVisible') === 'true',
    usageLimitTotal: clearableNum('usageLimitTotal'),
    usageLimitPerCustomer: clearableNum('usageLimitPerCustomer'),
    timeWindows,
    startsAt: clearableDate('startsAt'),
    endsAt: clearableDate('endsAt'),
    status: str('status'),
  };
}

/**
 * Structural stand-in for `ZodError` — the dashboard doesn't depend on zod
 * directly (schemas come pre-built from `@booking/contracts`), so the helper
 * types against the shape it reads rather than the class.
 */
interface ZodErrorLike {
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>;
}

/**
 * The first zod issue as a `path: message` line for the ErrorBanner — the one
 * failure format every promotion action returns on invalid input.
 */
export function zodFirstIssueMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  return first ? `${first.path.join('.')}: ${first.message}` : 'Dữ liệu không hợp lệ.';
}
