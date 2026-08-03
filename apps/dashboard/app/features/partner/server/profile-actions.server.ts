import { data as routeData } from 'react-router';
import type { PartnerResponse, UpdatePartnerDocumentsInput } from '@booking/contracts';
import {
  submitIdentityInputSchema,
  updatePartnerDocumentsInputSchema,
  updatePayoutInfoInputSchema,
} from '@booking/contracts';
import { apiGet, apiPatch, apiPost, type ApiAuth } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

export type PartnerProfileIntent = 'payout' | 'identity' | 'documents' | 'deleteDoc';

/**
 * Result shape of every partner-profile intent. Profile cards type against this
 * (type-only import — this module never reaches the client bundle).
 */
export interface PartnerProfileActionResult {
  intent: PartnerProfileIntent | '';
  ok: boolean;
  error: string | null;
  fieldErrors: Record<string, string[] | undefined> | null;
}

const fail = (
  intent: PartnerProfileIntent | '',
  error: string | null,
  fieldErrors: PartnerProfileActionResult['fieldErrors'] = null,
) => routeData<PartnerProfileActionResult>({ intent, ok: false, error, fieldErrors }, { status: 400 });

const succeed = (intent: PartnerProfileIntent): PartnerProfileActionResult => ({
  intent,
  ok: true,
  error: null,
  fieldErrors: null,
});

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
}

/**
 * The partner-profile action dispatch: `payout` / `identity` / `documents`
 * arrive as GenericForm JSON with an `intent` discriminator; `deleteDoc` is a
 * plain form post.
 */
export async function runPartnerProfileAction(
  request: Request,
  auth: ApiAuth,
): Promise<PartnerProfileActionResult | ReturnType<typeof fail>> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    const intent = typeof body.intent === 'string' ? (body.intent as PartnerProfileIntent) : '';

    if (intent === 'payout') {
      const parsed = updatePayoutInfoInputSchema.safeParse(body);
      if (!parsed.success) {
        return fail(intent, null, parsed.error.flatten().fieldErrors);
      }
      const res = await apiPatch(apiPaths.partner.profilePayout, parsed.data, auth);
      if (!res.ok) return fail(intent, res.error ?? 'Không lưu được tài khoản nhận tiền.');
      return succeed(intent);
    }

    if (intent === 'identity') {
      const parsed = submitIdentityInputSchema.safeParse(body);
      if (!parsed.success) {
        return fail(intent, null, parsed.error.flatten().fieldErrors);
      }
      const res = await apiPost(apiPaths.partner.profileIdentity, parsed.data, auth);
      if (!res.ok) return fail(intent, res.error ?? 'Không gửi được thông tin định danh.');
      return succeed(intent);
    }

    if (intent === 'documents') {
      const parsed = updatePartnerDocumentsInputSchema.safeParse(body);
      if (!parsed.success) {
        return fail(intent, null, parsed.error.flatten().fieldErrors);
      }
      // Only forward set keys, and APPEND new license docs onto the existing set
      // (the PATCH replaces the array — appending here keeps previous documents).
      const payload: UpdatePartnerDocumentsInput = {};
      if (parsed.data.logoUrl) payload.logoUrl = parsed.data.logoUrl;
      if (parsed.data.licenseDocs && parsed.data.licenseDocs.length > 0) {
        const current = await apiGet<PartnerResponse>(apiPaths.partner.profile, auth);
        const existing =
          current.ok && current.data ? readStringArray(current.data.businessInfo.licenseDocs) : [];
        payload.licenseDocs = [...existing, ...parsed.data.licenseDocs].slice(0, 20);
      }
      const res = await apiPatch(apiPaths.partner.profileDocuments, payload, auth);
      if (!res.ok) return fail(intent, res.error ?? 'Không lưu được giấy tờ.');
      return succeed(intent);
    }

    return fail('', actionMessages.invalidIntent);
  }

  // Plain form posts: deleting a single license document.
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (intent === 'deleteDoc') {
    const url = String(form.get('url') ?? '');
    const current = await apiGet<PartnerResponse>(apiPaths.partner.profile, auth);
    if (!current.ok || !current.data) {
      return fail(intent, 'Không tải được hồ sơ.');
    }
    const next = readStringArray(current.data.businessInfo.licenseDocs).filter((d) => d !== url);
    const res = await apiPatch(apiPaths.partner.profileDocuments, { licenseDocs: next }, auth);
    if (!res.ok) return fail(intent, res.error ?? 'Không xoá được giấy tờ.');
    return succeed(intent);
  }

  return fail('', actionMessages.invalidIntent);
}
