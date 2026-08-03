import { data, redirect } from 'react-router';
import { apiPost, type ApiAuth, type ApiResult } from '~/lib/api.server';
import { actionMessages } from '~/constants/messages';

/**
 * The one moderation action pipeline for the tenant review pages
 * (`/tenant/listings/:id/review` and `/tenant/listing-groups/:id/review`).
 * Both backends expose the same `POST {basePath}/{intent}` shape; the pages
 * differ only in which intents their UI offers and in the error copy.
 */

export type ModerationIntent = 'publish' | 'hide' | 'republish';

/**
 * Translate a failed moderation `ApiResult` to a Vietnamese message.
 * `LISTING_HAS_CONTACT_INFO` is the one backend code with page-specific
 * guidance (the review pages point at the force checkbox; the list page points
 * at the review screen), so the caller supplies that message.
 */
export function moderationErrorMessage(
  res: Pick<ApiResult<unknown>, 'code' | 'error'>,
  contactLeakMessage: string,
): string {
  if (res.code === 'LISTING_HAS_CONTACT_INFO') return contactLeakMessage;
  return res.error ?? actionMessages.actionFailed;
}

export interface RunModerationActionOptions {
  form: FormData;
  auth: ApiAuth;
  /** Backend endpoint prefix, e.g. apiPaths.tenant.listing(id) or apiPaths.tenant.listingGroup(id). */
  basePath: string;
  /**
   * Intents this page exposes — anything else (including a hand-crafted POST)
   * is rejected with a 400 before reaching the backend. The listing review
   * page allows all three; the group review page allows publish + hide only.
   */
  intents: readonly ModerationIntent[];
  /** Message for the `LISTING_HAS_CONTACT_INFO` publish block (page-specific wording). */
  contactLeakMessage: string;
  /** Where to navigate after a successful action. */
  redirectTo: string;
}

/**
 * Shared moderation `action` body. `publish` forwards `force` (form value `'1'`)
 * as the boolean body the backend's `PublishListingDto` expects; `hide` trims
 * the optional reason and omits it when blank; `republish` posts an empty body.
 */
export async function runModerationAction({
  form,
  auth,
  basePath,
  intents,
  contactLeakMessage,
  redirectTo,
}: RunModerationActionOptions) {
  const intent = String(form.get('intent') ?? '');
  if (!(intents as readonly string[]).includes(intent)) {
    return data({ error: actionMessages.invalidIntent }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  if (intent === 'publish') {
    body = { force: form.get('force') === '1' };
  } else if (intent === 'hide') {
    const reason = String(form.get('reason') ?? '').trim();
    body = reason ? { reason } : {};
  }

  const res = await apiPost(`${basePath}/${intent}`, body, auth);
  if (!res.ok) {
    return data({ error: moderationErrorMessage(res, contactLeakMessage) }, { status: 400 });
  }
  return redirect(redirectTo);
}

/** What a route `action` delegating to {@link runModerationAction} returns. */
export type ModerationActionResult = Awaited<ReturnType<typeof runModerationAction>>;
