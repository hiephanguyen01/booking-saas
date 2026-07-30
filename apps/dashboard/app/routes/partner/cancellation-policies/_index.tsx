import { data as routeData, Link, useFetcher } from 'react-router';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { CancellationPolicyResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiDelete, apiGet, apiPatch } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { PageHeader } from '~/components/page-header';
import { CancellationTiers } from '~/components/cancellation-tiers';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chính sách huỷ · Đối tác · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.listings.read');
  const res = await apiGet<CancellationPolicyResponse[]>('/partner/cancellation-policies', auth);
  return {
    policies: res.ok ? (res.data ?? []) : [],
    canWrite: can('partner.listings.write'),
    error: res.ok ? null : (res.error ?? 'Không tải được chính sách huỷ.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.listings.write');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  if (intent === 'delete') {
    const res = await apiDelete(`/partner/cancellation-policies/${String(form.get('id'))}`, auth);
    if (!res.ok) {
      return routeData(
        { error: res.error ?? 'Không xoá được (có thể đang gắn với tin đăng).' },
        { status: 400 },
      );
    }
    return { ok: true };
  }
  if (intent === 'set-default') {
    const raw = String(form.get('policyId') ?? '');
    const res = await apiPatch(
      '/partner/profile/default-cancellation-policy',
      { policyId: raw === '' ? null : raw },
      auth,
    );
    if (!res.ok) {
      return routeData({ error: res.error ?? 'Không đặt được mặc định.' }, { status: 400 });
    }
    return { ok: true };
  }
  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export default function PartnerCancellationPolicies({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { policies, canWrite, error } = loaderData;
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  const columns: DataTableColumn<CancellationPolicyResponse>[] = [
    {
      header: 'Tên',
      cell: (p) => (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.name}</span>
            {p.isDefault ? <Badge>Mặc định</Badge> : null}
            {p.partnerId === null ? (
              <Badge variant="outline" className="font-normal">
                Chung của tổ chức
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      header: 'Mốc hoàn tiền',
      cell: (p) => (
        <div className="max-w-sm">
          <CancellationTiers rules={p.rules} />
        </div>
      ),
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => (canWrite ? <RowActions policy={p} /> : null),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chính sách huỷ"
        description="Định nghĩa các mốc hoàn tiền khi khách huỷ. Gán cho từng tin đăng, hoặc đặt một chính sách làm mặc định cho các tin đăng chưa gán."
        actions={
          canWrite ? (
            <Button asChild size="sm">
              <Link to={dashboardPaths.partner.newCancellationPolicy}>
                <Plus className="size-4" /> Thêm chính sách
              </Link>
            </Button>
          ) : null
        }
      />
      {error || actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? actionError}
        </div>
      ) : null}
      <DashboardDataTable
        columns={columns}
        data={policies}
        getRowKey={(policy) => policy.id}
        emptyMessage='Chưa có chính sách huỷ nào. Nhấn "Thêm chính sách" để tạo chính sách đầu tiên.'
      />
    </div>
  );
}

function RowActions({ policy }: { policy: CancellationPolicyResponse }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  // Tenant-level (shared) policies are read-only to a partner — they can pick one as
  // their default but not edit or delete it.
  const isOwn = policy.partnerId !== null;

  return (
    <div className="flex justify-end gap-1.5">
      {policy.isDefault ? (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="set-default" />
          <input type="hidden" name="policyId" value="" />
          <Button type="submit" size="xs" variant="ghost" disabled={busy}>
            <Star className="size-3.5 fill-current" /> Bỏ mặc định
          </Button>
        </fetcher.Form>
      ) : (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="set-default" />
          <input type="hidden" name="policyId" value={policy.id} />
          <Button type="submit" size="xs" variant="ghost" disabled={busy}>
            <Star className="size-3.5" /> Đặt mặc định
          </Button>
        </fetcher.Form>
      )}
      {isOwn ? (
        <>
          <Button asChild size="xs" variant="ghost">
            <Link to={dashboardPaths.partner.cancellationPolicy(policy.id)}>
              <Pencil className="size-3.5" /> Sửa
            </Link>
          </Button>
          <fetcher.Form
            method="post"
            onSubmit={(e) => {
              if (!confirm(`Xoá chính sách “${policy.name}”?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={policy.id} />
            <Button
              type="submit"
              size="xs"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy}
            >
              <Trash2 className="size-3.5" /> Xoá
            </Button>
          </fetcher.Form>
        </>
      ) : null}
    </div>
  );
}
