import { data, redirect } from 'react-router';
import type { ListingResponse } from '@booking/contracts';
import { apiDelete, apiGet, apiPatch, apiPost, type ApiAuth } from '~/lib/api.server';

/**
 * Result shape every listing-group workspace intent resolves to. Feature
 * components type their `useFetcher<GroupActionResult>()` against this
 * (type-only import — this module never reaches the client bundle).
 */
export interface GroupActionResult {
  ok: boolean;
  error: string | null;
}

const groupResult = (body: GroupActionResult, status?: number) =>
  data<GroupActionResult>(body, status ? { status } : undefined);

type GroupActionResponse = ReturnType<typeof groupResult>;

/**
 * Duplicate a child listing inside its group as a new draft. Re-reads the
 * source through the partner-scoped API so a foreign/mismatched id 404s and
 * never leaks across partners.
 */
async function duplicateChildListing(
  auth: ApiAuth,
  groupId: string,
  listingId: string,
): Promise<GroupActionResponse> {
  const source = await apiGet<ListingResponse>(`/partner/listings/${listingId}`, auth);
  if (!source.ok || !source.data || source.data.groupId !== groupId) {
    return groupResult({ ok: false, error: 'Không tìm thấy hạng mục cần nhân bản.' }, 404);
  }
  const stamp = Date.now().toString(36);
  const listing = source.data;
  if (!listing.provinceCode || !listing.wardCode || !listing.address) {
    return groupResult(
      { ok: false, error: 'Vui lòng cập nhật địa chỉ hạng mục trước khi nhân bản.' },
      400,
    );
  }
  const res = await apiPost(
    '/partner/listings',
    {
      partnerId: listing.partnerId,
      listingTypeId: listing.listingTypeId,
      groupId: listing.groupId ?? undefined,
      categoryId: listing.categoryId ?? undefined,
      title: `${listing.title} (bản sao)`,
      slug: `${listing.slug}-copy-${stamp}`,
      description: listing.description ?? undefined,
      provinceCode: listing.provinceCode,
      wardCode: listing.wardCode,
      address: listing.address,
      photos: listing.photos,
      attributes: listing.attributes,
      bookingModes: listing.bookingModes,
      modeConfig: listing.modeConfig,
      stockQuantity: listing.stockQuantity ?? undefined,
      capacity: listing.capacity ?? undefined,
      bufferBefore: listing.bufferBefore,
      bufferAfter: listing.bufferAfter,
      approvalRequired: listing.approvalRequired,
      depositPercent: listing.depositPercent,
      balanceDue: listing.balanceDue,
      cancellationPolicyId: listing.cancellationPolicyId ?? undefined,
    },
    auth,
  );
  return res.ok
    ? groupResult({ ok: true, error: null })
    : groupResult({ ok: false, error: res.error ?? 'Nhân bản hạng mục không thành công.' }, 400);
}

/**
 * The listing-group workspace intent dispatch: lifecycle (submit / hide /
 * republish / reopen / delete-group) plus per-child actions (delete-child /
 * duplicate-child). Permission checks stay here so the route action stays thin.
 */
export async function runListingGroupAction(args: {
  request: Request;
  groupId: string;
  auth: ApiAuth;
  can: (permission: string) => boolean;
}): Promise<GroupActionResponse | Response> {
  const { request, groupId, auth, can } = args;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (
    ['submit', 'reopen', 'delete-group', 'delete-child', 'duplicate-child'].includes(intent) &&
    !can('partner.listings.write')
  ) {
    return groupResult({ ok: false, error: 'Không có quyền thay đổi tin đăng.' }, 403);
  }
  if (['hide', 'republish'].includes(intent) && !can('partner.listings.publish')) {
    return groupResult({ ok: false, error: 'Không có quyền hiển thị hoặc ẩn tin đăng.' }, 403);
  }
  if (intent === 'submit') {
    const res = await apiPost(`/partner/listing-groups/${groupId}/submit`, {}, auth);
    return res.ok
      ? groupResult({ ok: true, error: null })
      : groupResult({ ok: false, error: res.error ?? 'Gửi duyệt không thành công.' }, 400);
  }
  if (intent === 'hide' || intent === 'republish') {
    const res = await apiPost(`/partner/listing-groups/${groupId}/${intent}`, {}, auth);
    return res.ok
      ? groupResult({ ok: true, error: null })
      : groupResult({ ok: false, error: res.error ?? 'Thao tác không thành công.' }, 400);
  }
  if (intent === 'reopen') {
    // Updating an archived group intentionally moves the group and all children
    // back to draft in the API, making item editing available again.
    const res = await apiPatch(`/partner/listing-groups/${groupId}`, {}, auth);
    return res.ok
      ? groupResult({ ok: true, error: null })
      : groupResult(
          { ok: false, error: res.error ?? 'Không thể chuyển tin đăng về bản nháp.' },
          400,
        );
  }
  if (intent === 'delete-group') {
    const res = await apiDelete(`/partner/listing-groups/${groupId}`, auth);
    if (!res.ok) {
      return groupResult({ ok: false, error: res.error ?? 'Xóa tin đăng không thành công.' }, 400);
    }
    return redirect('/partner/listings');
  }
  if (intent === 'delete-child') {
    const res = await apiDelete(`/partner/listings/${String(form.get('listingId') ?? '')}`, auth);
    return res.ok
      ? groupResult({ ok: true, error: null })
      : groupResult({ ok: false, error: res.error ?? 'Xóa hạng mục không thành công.' }, 400);
  }
  if (intent === 'duplicate-child') {
    return duplicateChildListing(auth, groupId, String(form.get('listingId') ?? ''));
  }
  return groupResult({ ok: false, error: 'Hành động không hợp lệ.' }, 400);
}
