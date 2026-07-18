import { Form, useSearchParams } from 'react-router';
import {
  settlementStatusSchema,
  type BookingSettlementResponse,
  type Paginated,
  type SettlementStatusDto,
} from '@booking/contracts';
import { Filter } from 'lucide-react';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { SETTLEMENT_STATUS_LABEL } from '~/constants/finance';
import { ErrorBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đối soát giữ tiền · Bookify Admin' }];
}

function parseStatus(raw: string | null): SettlementStatusDto | '' {
  const parsed = settlementStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : '';
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.finance.read');
  const list = readListParams(url.searchParams);
  const status = parseStatus(url.searchParams.get('status'));
  const result = await apiGet<Paginated<BookingSettlementResponse>>(
    '/platform/finance/settlements',
    auth,
    { query: list.toApiQuery({ status: status || undefined }) },
  );
  return {
    status,
    result: result.ok ? result.data : null,
    error: result.ok ? null : (result.error ?? 'Không tải được sổ đối soát.'),
  };
}

const columns: DataTableColumn<BookingSettlementResponse>[] = [
  {
    header: 'Tenant / booking',
    cell: (row) => (
      <div>
        <p className="font-medium">{row.tenantName ?? row.tenantId.slice(0, 8)}</p>
        <p className="font-mono text-xs text-muted-foreground">{row.bookingCode ?? row.bookingId.slice(0, 8)}</p>
      </div>
    ),
  },
  {
    header: 'Dịch vụ / Partner',
    cell: (row) => (
      <div>
        <p>{row.listingTitle ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{row.partnerName ?? '—'}</p>
      </div>
    ),
  },
  {
    header: 'Trạng thái',
    cell: (row) => (
      <Badge variant={row.status === 'disputed' ? 'destructive' : 'secondary'}>
        {SETTLEMENT_STATUS_LABEL[row.status]}
      </Badge>
    ),
  },
  {
    header: 'Tenant giữ',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => <Money value={row.remainingHeldAmount} />,
  },
  {
    header: 'Partner payable',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => <Money value={row.partnerPayable} />,
  },
  {
    header: 'Đã chi / còn lại',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => (
      <div>
        <Money value={row.paidAmount} />
        <p className="text-xs text-muted-foreground">còn <Money value={row.remainingPayableAmount} /></p>
      </div>
    ),
  },
];

export default function PlatformSettlements({ loaderData }: Route.ComponentProps) {
  const { result, error, status } = loaderData;
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);
  return (
    <div className="space-y-6">
      <PageHeader title="Đối soát giữ tiền" description="Theo dõi custody, tranh chấp, refund và payout của mọi Tenant." />
      <Card>
        <CardContent className="p-4">
          <Form method="get" className="flex items-end gap-3">
            <input type="hidden" name="pageSize" value={list.pageSize} />
            <div className="space-y-1.5">
              <Label htmlFor="status">Trạng thái</Label>
              <NativeSelect id="status" name="status" defaultValue={status}>
                <NativeSelectOption value="">Tất cả</NativeSelectOption>
                {(Object.keys(SETTLEMENT_STATUS_LABEL) as SettlementStatusDto[]).map((value) => (
                  <NativeSelectOption key={value} value={value}>{SETTLEMENT_STATUS_LABEL[value]}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" size="control" variant="outline"><Filter className="size-4" /> Lọc</Button>
          </Form>
        </CardContent>
      </Card>
      <ErrorBanner error={error} />
      <DataTable columns={columns} data={result?.items ?? []} getRowKey={(row) => row.id} emptyMessage="Chưa có settlement." />
      <PaginationBar page={list.page} pageSize={list.pageSize} total={result?.total ?? 0} hrefFor={list.pageHref} />
    </div>
  );
}
