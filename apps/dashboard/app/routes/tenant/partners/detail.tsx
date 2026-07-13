import { Form, Link, useNavigation, data as routeData } from 'react-router';
import type { PartnerResponse } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ArrowLeft, CircleAlert, Check, BadgeCheck, Ban } from 'lucide-react';
import type { Route } from './+types/detail';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatDate, formatDateTime, PARTNER_TYPE_LABEL as TYPE_LABEL } from '../format';
import { PageHeader } from '../components/page';
import { PartnerStatusBadge, PartnerVerificationBadge } from '../components/status';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết đối tác · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.partners.read');
  const res = await apiGet<PartnerResponse>(`/tenant/partners/${params.partnerId}`, auth);
  if (!res.ok || !res.data) throw new Response('Không tìm thấy đối tác', { status: 404 });
  return {
    partner: res.data,
    canApprove: can('tenant.partners.approve'),
    canManage: can('tenant.partners.manage'),
  };
}

/** Intent → the permission the backend enforces, so we fail closed with a clean 403. */
const PERM: Record<string, string> = {
  approve: 'tenant.partners.approve',
  verify: 'tenant.partners.approve',
  suspend: 'tenant.partners.manage',
};

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, can } = await requireTenant(request);
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const perm = PERM[intent];
  if (!perm) return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  if (!can(perm)) return routeData({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });

  const id = params.partnerId;
  const body = intent === 'verify' ? { note: String(form.get('note') ?? '').trim() || undefined } : {};
  const res = await apiPost(`/tenant/partners/${id}/${intent}`, body, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Thao tác không thành công.' }, { status: 400 });
  return { ok: true };
}

export default function PartnerDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { partner, canApprove, canManage } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  const payout = partner.payoutInfo as { bank?: string; accountNumber?: string; holderName?: string };
  const hasPayout = Boolean(payout?.bank || payout?.accountNumber || payout?.holderName);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/partners">
          <ArrowLeft className="size-4" /> Đối tác
        </Link>
      </Button>

      <PageHeader
        title={partner.name}
        description={`/${partner.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {partner.isHouse ? <Badge variant="outline">Nội bộ</Badge> : null}
            <PartnerStatusBadge status={partner.status} />
            <PartnerVerificationBadge status={partner.verificationStatus} />
          </div>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Thông tin</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Loại đối tác" value={TYPE_LABEL[partner.partnerType] ?? partner.partnerType} />
            <Field label="Ngày tham gia" value={formatDate(partner.createdAt)} />
            <Field label="Ngày sinh" value={partner.dateOfBirth ? formatDate(partner.dateOfBirth) : '—'} />
            <Field
              label="Đã xác minh lúc"
              value={partner.verifiedAt ? formatDateTime(partner.verifiedAt) : '—'}
            />
            {partner.description ? (
              <div className="sm:col-span-2">
                <Field label="Giới thiệu" value={partner.description} />
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {hasPayout ? (
        <Card>
          <CardHeader>
            <CardTitle>Thông tin nhận tiền</CardTitle>
            <CardDescription>Dùng để chi trả doanh thu cho đối tác.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label="Ngân hàng" value={payout.bank ?? '—'} />
              <Field label="Số tài khoản" value={payout.accountNumber ?? '—'} />
              <Field label="Chủ tài khoản" value={payout.holderName ?? '—'} />
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {/* Approve a pending application. */}
      {partner.status === 'pending' && canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle>Duyệt đối tác</CardTitle>
            <CardDescription>
              Chấp thuận đối tác tham gia marketplace — họ sẽ có thể đăng listing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <Button type="submit" disabled={busy}>
                <Check className="size-4" /> Duyệt đối tác
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {/* Manual identity review once the partner has submitted documents. */}
      {partner.verificationStatus === 'pending' && canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle>Xác minh danh tính</CardTitle>
            <CardDescription>
              Đối chiếu giấy tờ đã nộp. Hệ thống sẽ từ chối nếu dưới 18 tuổi hoặc tên không khớp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="verify" />
              <Textarea name="note" placeholder="Ghi chú xét duyệt (tuỳ chọn)…" rows={2} />
              <Button type="submit" disabled={busy}>
                <BadgeCheck className="size-4" /> Xác minh danh tính
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {/* Suspend an approved partner. */}
      {partner.status === 'approved' && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Tạm ngưng đối tác</CardTitle>
            <CardDescription>
              Ẩn listing của đối tác khỏi storefront và chặn nhận đặt chỗ mới.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <input type="hidden" name="intent" value="suspend" />
              <Button type="submit" variant="destructive" disabled={busy}>
                <Ban className="size-4" /> Tạm ngưng
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
