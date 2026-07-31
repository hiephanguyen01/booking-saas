import { data as routeData, redirect } from 'react-router';
import {
  acceptLegalInputSchema,
  legalDocumentTypeSchema,
  publishLegalDocumentInputSchema,
  saveLegalDraftInputSchema,
  tenantLegalOverviewSchema,
  type AcceptLegalInput,
  type PendingAcceptance,
  type TenantLegalOverview,
} from '@booking/contracts';
import { apiDelete, apiGet, apiPost, apiPut, type ApiAuth, type ApiResult } from '~/lib/api.server';

/**
 * Cross-area legal-document server helpers. Legal spans three areas (tenant
 * authoring, partner + affiliate re-acceptance), so it lives beside
 * `bookings`/`promotions` as a guard-less cross-area domain feature rather
 * than under `features/tenant` — see `apps/dashboard/CLAUDE.md`.
 */

/** `GET /tenant/legal` — the authoring overview behind the "Pháp lý" tab (`tenant.legal.manage`). */
export function fetchTenantLegalOverview(auth: ApiAuth): Promise<ApiResult<TenantLegalOverview>> {
  return apiGet<TenantLegalOverview>('/tenant/legal', auth, { schema: tenantLegalOverviewSchema });
}

/**
 * `GET /me/legal/pending` — any published legal versions the signed-in user has
 * not yet accepted in their current partner/affiliate context. An empty array
 * means nothing blocks them; the partner/affiliate layout loaders redirect to
 * the interstitial when this is non-empty.
 */
export function fetchPendingLegalAcceptances(auth: ApiAuth): Promise<ApiResult<PendingAcceptance[]>> {
  return apiGet<PendingAcceptance[]>('/me/legal/pending', auth);
}

/** `POST /me/legal/accept` — the interstitial's single "Tôi đồng ý" action. */
export function acceptLegalDocuments(auth: ApiAuth, input: AcceptLegalInput) {
  return apiPost('/me/legal/accept', input, auth);
}

const LEGAL_INTENTS = ['save-legal-draft', 'publish-legal-document', 'withdraw-legal-document'] as const;
type LegalIntent = (typeof LEGAL_INTENTS)[number];

export function isLegalIntent(intent: string): intent is LegalIntent {
  return (LEGAL_INTENTS as readonly string[]).includes(intent);
}

/**
 * The tenant settings route's legal-tab mutations (draft save / publish /
 * withdraw), kept out of the route module the same way every other settings
 * card's action lives in `settings-actions.server.ts`. Returns the same
 * `{ form, ok }` / `{ form, error, fieldErrors? }` shape the rest of that
 * action uses, so `settings.tsx` reads it identically to every other card.
 */
export async function handleLegalSettingsAction(intent: LegalIntent, body: unknown, auth: ApiAuth) {
  const docTypeParsed = legalDocumentTypeSchema.safeParse(
    body && typeof body === 'object' ? (body as { docType?: unknown }).docType : undefined,
  );
  if (!docTypeParsed.success) {
    return routeData({ form: 'legal-draft', error: 'Loại tài liệu không hợp lệ.' }, { status: 400 });
  }
  const docType = docTypeParsed.data;

  if (intent === 'save-legal-draft') {
    const parsed = saveLegalDraftInputSchema.safeParse(body);
    if (!parsed.success) {
      return routeData(
        {
          form: 'legal-draft',
          error: 'Nội dung bản nháp không hợp lệ.',
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const res = await apiPut(`/tenant/legal/${docType}/draft`, parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'legal-draft', error: res.error ?? 'Không lưu được bản nháp.' },
        { status: 400 },
      );
    }
    return { form: 'legal-draft', ok: true };
  }

  if (intent === 'publish-legal-document') {
    const parsed = publishLegalDocumentInputSchema.safeParse(body);
    if (!parsed.success) {
      return routeData(
        { form: 'legal-publish', error: 'Lựa chọn công bố không hợp lệ.' },
        { status: 400 },
      );
    }
    const res = await apiPost(`/tenant/legal/${docType}/publish`, parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'legal-publish', error: res.error ?? 'Không công bố được tài liệu.' },
        { status: 400 },
      );
    }
    return { form: 'legal-publish', ok: true };
  }

  // intent === 'withdraw-legal-document'
  const res = await apiDelete(`/tenant/legal/${docType}/publish`, auth);
  if (!res.ok) {
    return routeData(
      { form: 'legal-withdraw', error: res.error ?? 'Không rút công bố được tài liệu.' },
      { status: 400 },
    );
  }
  return { form: 'legal-withdraw', ok: true };
}

/**
 * Validates + submits the interstitial's accept action. On success it redirects
 * straight to `redirectTo` (mirrors `moderation-action.server.ts`'s pipeline —
 * the caller doesn't need to branch on the result), so the route module's
 * `action` can simply `return handleAcceptLegalAction(request, auth, dashboardPaths…)`.
 */
export async function handleAcceptLegalAction(request: Request, auth: ApiAuth, redirectTo: string) {
  const body: unknown = await request.json();
  const parsed = acceptLegalInputSchema.safeParse(body);
  if (!parsed.success) {
    return routeData({ error: 'Yêu cầu đồng ý không hợp lệ.' }, { status: 400 });
  }
  const res = await acceptLegalDocuments(auth, parsed.data);
  if (!res.ok) {
    return routeData({ error: res.error ?? 'Không ghi nhận được sự đồng ý.' }, { status: 400 });
  }
  return redirect(redirectTo);
}
