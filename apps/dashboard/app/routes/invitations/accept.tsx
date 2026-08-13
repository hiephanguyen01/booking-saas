import { Form, redirect, useNavigation } from 'react-router';
import { Building2, Clock, LogOut, XCircle } from 'lucide-react';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import type { TenantInvitationPreview } from '@booking/contracts';
import type { Route } from './+types/accept';
import { ErrorBanner } from '~/components/action-feedback';
import { unwrapApiResult, type ApiResult } from '~/lib/api.server';
import {
  acceptInvitation,
  fetchInvitationPreview,
  requireInvitationRecipient,
} from '~/features/tenant/server/invitation.server';
import { actionMessages } from '~/constants/messages';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Lời mời tham gia · BookingOS Dashboard' }];
}

/**
 * `requireInvitationRecipient` requires only a signed-in account (never a
 * tenant/partner membership — that's exactly what the recipient of this
 * screen doesn't have yet). See its own comment and `routes.ts` for why this
 * route is registered at the top level rather than under `/tenant`.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const token = params.token;
  const { auth, currentEmail } = await requireInvitationRecipient(request, token);
  const res = await fetchInvitationPreview(auth, token);
  const preview = unwrapApiResult(res, 'Không tải được lời mời.');
  return { token, preview, currentEmail };
}

/**
 * The only mutation this screen offers. `requireInvitationRecipient` re-runs
 * on the action too (a POST carries no loader data), so a token that expired
 * or was revoked between page load and this click still gets refused by the
 * backend's own checks — never accepted as whoever happens to be signed in.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token;
  const { auth } = await requireInvitationRecipient(request, token);
  const res = await acceptInvitation(auth, token);
  if (!res.ok) {
    return { error: acceptInvitationErrorMessage(res) };
  }
  // The user now holds a membership in the tenant, so its area will admit them.
  return redirect(dashboardPaths.tenant.home);
}

function acceptInvitationErrorMessage(res: ApiResult<unknown>): string {
  if (res.code === 'INVITATION_EMAIL_MISMATCH') {
    return 'Lời mời này không dành cho tài khoản đang đăng nhập.';
  }
  if (res.code === 'INVITATION_NOT_PENDING') {
    return 'Lời mời này không còn hiệu lực. Hãy tải lại trang.';
  }
  if (res.code === 'INVITATION_ROLES_GONE') {
    return 'Các vai trò trong lời mời này không còn tồn tại. Hãy đề nghị gửi lại lời mời.';
  }
  return res.error ?? actionMessages.actionFailed;
}

export default function AcceptInvitation({ loaderData, actionData }: Route.ComponentProps) {
  const { preview, currentEmail } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const error = actionData && 'error' in actionData ? actionData.error : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="size-6" aria-hidden />
          </div>
          <CardTitle className="text-xl">Lời mời tham gia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <ErrorBanner error={error} />
          <InvitationState preview={preview} currentEmail={currentEmail} busy={busy} />
        </CardContent>
      </Card>
    </main>
  );
}

/** Four distinct states, four distinct screens — see `task-14-brief.md`. */
function InvitationState({
  preview,
  currentEmail,
  busy,
}: {
  preview: TenantInvitationPreview;
  currentEmail: string;
  busy: boolean;
}) {
  if (preview.status === 'expired') {
    return (
      <div className="space-y-3">
        <Clock className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Lời mời đã hết hạn. Hãy đề nghị <strong className="text-foreground">{preview.tenantName}</strong>{' '}
          gửi lại.
        </p>
      </div>
    );
  }

  if (preview.status === 'revoked' || preview.status === 'accepted') {
    return (
      <div className="space-y-3">
        <XCircle className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Lời mời này không còn hiệu lực.</p>
      </div>
    );
  }

  // preview.status === 'pending' from here.
  if (!preview.matchesCurrentUser) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lời mời này gửi cho <strong className="text-foreground">{preview.invitedEmail}</strong>, nhưng
          bạn đang đăng nhập bằng <strong className="text-foreground">{currentEmail}</strong>.
        </p>
        <p className="text-sm text-muted-foreground">
          Đăng xuất rồi đăng nhập lại bằng đúng địa chỉ email được mời để chấp nhận lời mời này.
        </p>
        <Form method="post" action={dashboardPaths.auth.logout}>
          <Button type="submit" variant="outline" className="w-full" disabled={busy}>
            <LogOut className="size-4" /> Đăng xuất
          </Button>
        </Form>
      </div>
    );
  }

  // `GetInvitationPreviewUseCase` drops a role deleted since the invite was
  // sent rather than failing the preview — same as the tenant-facing list —
  // so every one of them can be gone while the invitation is still `pending`.
  // Accepting would then hit `INVITATION_ROLES_GONE` (409), surfaced through
  // the action's error banner; the copy here just avoids naming zero roles.
  const roleNames = preview.roles.map((role) => role.name).join(', ');

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{preview.tenantName}</strong> mời bạn tham gia
        {roleNames ? (
          <>
            {' '}
            với vai trò <strong className="text-foreground">{roleNames}</strong>
          </>
        ) : null}
        .
      </p>
      <Form method="post">
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Đang xử lý...' : 'Chấp nhận lời mời'}
        </Button>
      </Form>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref={dashboardPaths.home} homeLabel="Về trang chủ" />;
}
