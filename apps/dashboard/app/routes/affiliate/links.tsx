import { useFetcher, useSearchParams, data as routeData } from 'react-router';
import type { Paginated, ReferralLinkResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Badge } from '@booking/ui/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import type { Route } from './+types/links';
import { apiGet, apiPost, apiDelete } from '~/lib/api.server';
import { requireAffiliate } from '~/features/affiliate/server/affiliate.server';
import { REFERRAL_TARGET_LABEL } from '~/constants/affiliate';
import { ErrorBanner } from '~/components/action-feedback';
import { CopyableCode } from '~/components/copyable-code';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';
import { ListToolbar } from '~/components/list-toolbar';
import { dashboardPaths } from '~/constants/paths';
import { PaginationBar } from '~/components/pagination-bar';

const LINK_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Mã hoặc nhãn liên kết…' },
];

/**
 * The origin an affiliate's referral links must point at.
 *
 * This is per-tenant data, not deployment config: each tenant storefront lives on
 * its own hostname (§6.1), so a single platform-wide env var can only ever be
 * right for one of them. The membership's `tenantHostname` (the tenant's primary
 * domain) is therefore authoritative; `STOREFRONT_URL` is a fallback for the one
 * case it cannot answer — a tenant with no primary domain mapped.
 */
function storefrontOrigin(tenantHostname: string | null): string {
  if (!tenantHostname) return process.env.STOREFRONT_URL ?? 'http://localhost:5173';
  const isLocal =
    tenantHostname === 'localhost' ||
    tenantHostname === '127.0.0.1' ||
    tenantHostname.endsWith('.localhost');
  return `${isLocal ? 'http' : 'https'}://${tenantHostname}`;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, active } = await requireAffiliate(request);
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, LINK_FILTER_SPEC);
  const links = active
    ? await apiGet<Paginated<ReferralLinkResponse>>('/affiliate/links', auth, {
        query: toApiQuery(apiFilters),
      })
    : null;
  return {
    result: links?.ok ? links.data : null,
    storefrontUrl: storefrontOrigin(active?.tenantHostname ?? null),
    filters,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, active } = await requireAffiliate(request);
  if (!active) return routeData({ error: 'Chưa được duyệt.' }, { status: 403 });

  const form = await request.formData();
  const intent = String(form.get('intent'));

  if (intent === 'create') {
    const res = await apiPost('/affiliate/links', { target: 'tenant_home' }, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không tạo được link.' }, { status: 400 });
    return { ok: true, error: null };
  }
  if (intent === 'delete') {
    const id = String(form.get('id'));
    const res = await apiDelete(`/affiliate/links/${id}`, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không xoá được link.' }, { status: 400 });
    return { ok: true, error: null };
  }
  return routeData({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
}

/** Full referral URL for a link — origin from the tenant's own hostname, never a shared env var. */
function referralUrl(storefrontUrl: string, code: string): string {
  return `${storefrontUrl}/?ref=${encodeURIComponent(code)}`;
}

export default function AffiliateLinks({ loaderData, actionData }: Route.ComponentProps) {
  const { result, storefrontUrl, filters } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const links = result?.items ?? [];
  const total = result?.total ?? 0;
  const createFetcher = useFetcher<typeof action>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Chia sẻ link giới thiệu — khách hàng đặt chỗ trong 30 ngày sau khi click sẽ được ghi nhận cho bạn.
        </p>
        <createFetcher.Form method="post">
          <input type="hidden" name="intent" value="create" />
          <Button type="submit" size="sm" disabled={createFetcher.state !== 'idle'}>
            <Plus className="size-4" /> Tạo link mới
          </Button>
        </createFetcher.Form>
      </div>

      <ErrorBanner error={actionData?.error} />

      <ListToolbar
        spec={LINK_FILTER_SPEC}
        filters={filters}
        resetHref={dashboardPaths.affiliate.links}
        pageSize={pageSize}
      />

      {links.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {hasActiveFilters(filters)
              ? 'Không có link khớp bộ lọc.'
              : 'Chưa có link nào. Nhấn “Tạo link mới” để bắt đầu.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <LinkRow key={link.id} link={link} storefrontUrl={storefrontUrl} />
          ))}
        </div>
      )}

      <PaginationBar page={page} pageSize={pageSize} total={total} hrefFor={pageHref} />
    </div>
  );
}

function LinkRow({ link, storefrontUrl }: { link: ReferralLinkResponse; storefrontUrl: string }) {
  const deleteFetcher = useFetcher<typeof action>();
  const url = referralUrl(storefrontUrl, link.code);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <CopyableCode value={url} label="link giới thiệu" className="max-w-full" />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {link.code}
            </Badge>
            <span>
              <EnumValue map={REFERRAL_TARGET_LABEL} value={link.target} />
              {link.target === 'listing' && link.listingTitle ? ` · ${link.listingTitle}` : ''}
            </span>
            <span className="tabular-nums">{link.clicksCount} click</span>
            <span>·</span>
            <DateTimeValue iso={link.createdAt} />
          </div>
        </div>
        <deleteFetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={link.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={deleteFetcher.state !== 'idle'}
            aria-label="Xoá link"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </deleteFetcher.Form>
      </CardContent>
    </Card>
  );
}
