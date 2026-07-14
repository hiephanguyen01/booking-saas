import { data, Form, Link, useNavigation } from 'react-router';
import type { PromotionResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { CircleAlert, HandCoins, Pencil, Plus } from 'lucide-react';
import type { Route } from './+types/promotions';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from './components/page-header';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Khuyến mãi · Đối tác · Bookify' }];
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp', active: 'Đang chạy', paused: 'Tạm dừng', ended: 'Đã kết thúc',
};

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.promotions.manage')) {
    throw new Response('Không có quyền quản lý khuyến mãi.', { status: 403 });
  }
  const [mine, pending] = await Promise.all([
    apiGet<PromotionResponse[]>('/partner/promotions', auth),
    apiGet<PromotionResponse[]>('/partner/promotions/pending-optin', auth),
  ]);
  return {
    promotions: mine.ok ? (mine.data ?? []) : [],
    pending: pending.ok ? (pending.data ?? []) : [],
    error: mine.ok ? null : (mine.error ?? 'Không tải được khuyến mãi.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.promotions.manage')) {
    throw new Response('Không có quyền.', { status: 403 });
  }
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const id = String(form.get('promotionId'));
  const path = intent === 'opt-in' ? `/partner/promotions/${id}/opt-in` : `/partner/promotions/${id}/end`;
  const res = await apiPost(path, {}, auth);
  if (!res.ok) return data({ error: res.error ?? 'Thao tác thất bại.' }, { status: 400 });
  return { ok: true };
}

export default function PartnerPromotions({ loaderData, actionData }: Route.ComponentProps) {
  const { promotions, pending, error } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  const columns: DataTableColumn<PromotionResponse>[] = [
    {
      header: 'Chương trình',
      cell: (p) => (
        <Link to={`/partner/promotions/${p.id}`} className="font-medium hover:underline">
          {p.name}
          {p.code ? <span className="ml-2 text-muted-foreground">{p.code}</span> : <Badge variant="outline" className="ml-2">Tự động</Badge>}
        </Link>
      ),
    },
    {
      header: 'Giảm',
      cell: (p) => (p.discountType === 'percent' ? `${p.discountValue}%` : `${Number(p.discountValue).toLocaleString('vi-VN')}₫`),
    },
    { header: 'Trạng thái', cell: (p) => <Badge variant={p.status === 'active' ? 'default' : 'outline'}>{STATUS_LABEL[p.status] ?? p.status}</Badge> },
    {
      header: '',
      cell: (p) => (
        <Button asChild variant="ghost" size="sm"><Link to={`/partner/promotions/${p.id}`}><Pencil className="size-4" /></Link></Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Khuyến mãi"
        description="Tạo mã giảm giá do bạn tài trợ cho listing của mình."
        actions={<Button asChild><Link to="/partner/promotions/new"><Plus className="size-4" /> Tạo khuyến mãi</Link></Button>}
      />

      {actionError ? (
        <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{actionError}</AlertDescription></Alert>
      ) : null}

      {pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HandCoins className="size-5" /> Chờ bạn đồng ý tài trợ</CardTitle>
            <CardDescription>Cửa hàng tạo các khuyến mãi này với chi phí do bạn chịu — chỉ có hiệu lực sau khi bạn đồng ý.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <div>
                  <p className="font-medium">{p.name} {p.code ? <span className="text-muted-foreground">({p.code})</span> : null}</p>
                  <p className="text-sm text-muted-foreground">
                    Giảm {p.discountType === 'percent' ? `${p.discountValue}%` : `${Number(p.discountValue).toLocaleString('vi-VN')}₫`}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="opt-in" />
                  <input type="hidden" name="promotionId" value={p.id} />
                  <Button type="submit" size="sm" disabled={busy}>Đồng ý tài trợ</Button>
                </Form>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Khuyến mãi của bạn</CardTitle></CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>
          ) : (
            <DataTable data={promotions} columns={columns} emptyMessage="Chưa có khuyến mãi nào." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
