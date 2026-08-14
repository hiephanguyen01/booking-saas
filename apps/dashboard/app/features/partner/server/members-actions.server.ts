import { data as routeData } from 'react-router';
import { invitePartnerMemberInputSchema, setPartnerMemberRolesInputSchema } from '@booking/contracts';
import { apiDelete, apiPost, apiPut } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';
import { requirePartner } from '~/features/partner/server/partner.server';
import { domainErrorMessage } from '~/features/members/server/domain-error-message.server';

/**
 * The partner staff area's multi-intent action ("Nhân sự" screen, Task 7) —
 * the partner-tier mirror of `handleMembersAction`. Every route in this area
 * delegates here so the write paths stay in one place while each route
 * module stays focused on composition.
 *
 * Unlike the tenant tier's dispatcher, `requirePartner` IS called with a
 * permission up front: all four intents below (`invite`, `set-roles`,
 * `revoke-invitation`, `remove-member`) map onto `PartnerMemberController`
 * endpoints that every one of them declares `partner.members.manage` on —
 * there is no second permission splitting off a "Vai trò" tab the way
 * `tenant.roles.manage` does for the tenant tier (this tier ships no role
 * management screen: `create-role`/`update-role`/`delete-role` have no
 * partner-tier route to submit to). The UI itself never offers this intent
 * to a caller who lacks it — `loadPartnerMembers` 403s outright before the
 * screen renders — so this permission check is defence in depth against a
 * direct POST, not the primary gate.
 *
 * GenericForm intents (`invite`, `set-roles`) submit JSON and are
 * re-validated with the matching Task 1 schema; the plain single-button
 * intents (`revoke-invitation`, `remove-member`) submit FormData — mirrors
 * `handleMembersAction`'s split.
 */
export async function handlePartnerMembersAction({ request }: { request: Request }) {
  const { auth } = await requirePartner(request, 'partner.members.manage');
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();
    const intent =
      body && typeof body === 'object' && 'intent' in body
        ? String((body as { intent?: unknown }).intent ?? '')
        : '';

    if (intent === 'invite') {
      const parsed = invitePartnerMemberInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost(apiPaths.partner.invitations, parsed.data, auth);
      if (!res.ok) {
        return routeData(
          {
            error: domainErrorMessage(res, 'Không gửi được lời mời.'),
            fieldErrors: res.errors ?? null,
          },
          { status: 400 },
        );
      }
      return { intent, ok: true };
    }

    if (intent === 'set-roles') {
      const userId = String((body as { userId?: unknown }).userId ?? '');
      const parsed = setPartnerMemberRolesInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPut(apiPaths.partner.memberRoles(userId), parsed.data, auth);
      if (!res.ok) {
        return routeData(
          {
            error: domainErrorMessage(res, 'Không cập nhật được vai trò.'),
            fieldErrors: res.errors ?? null,
          },
          { status: 400 },
        );
      }
      return { intent, ok: true };
    }

    return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  if (intent === 'revoke-invitation') {
    const id = String(formData.get('invitationId') ?? '');
    const res = await apiDelete(apiPaths.partner.invitation(id), auth);
    if (!res.ok) {
      return routeData({ error: domainErrorMessage(res, 'Không huỷ được lời mời.') }, { status: 400 });
    }
    return { intent, ok: true };
  }

  if (intent === 'remove-member') {
    const userId = String(formData.get('userId') ?? '');
    const res = await apiDelete(apiPaths.partner.member(userId), auth);
    if (!res.ok) {
      return routeData(
        { error: domainErrorMessage(res, 'Không xoá được thành viên.') },
        { status: 400 },
      );
    }
    return { intent, ok: true };
  }

  return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
}
