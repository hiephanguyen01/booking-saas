import type { AffiliateDetailResponse } from '@booking/contracts';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { REFERRAL_TARGET_LABEL } from '~/constants/affiliate';
import { CopyableCode } from '~/components/copyable-code';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';

type AffiliateLink = AffiliateDetailResponse['links'][number];

const linkColumns: DataTableColumn<AffiliateLink>[] = [
  { header: 'Mã', cell: (l) => <CopyableCode value={l.code} label="mã giới thiệu" /> },
  {
    header: 'Đích',
    cell: (l) => (
      <span className="text-sm text-muted-foreground">
        <EnumValue map={REFERRAL_TARGET_LABEL} value={l.target} />
        {l.target === 'listing' && l.listingTitle ? ` · ${l.listingTitle}` : ''}
      </span>
    ),
  },
  {
    header: 'Lượt click',
    cell: (l) => <span className="tabular-nums">{l.clicksCount}</span>,
    className: 'text-right',
    headClassName: 'text-right',
  },
  {
    header: 'Ngày tạo',
    cell: (l) => <DateTimeValue iso={l.createdAt} className="text-sm text-muted-foreground" />,
    className: 'hidden sm:table-cell',
    headClassName: 'hidden sm:table-cell',
  },
];

/** The affiliate's referral links with click counts. */
export function AffiliateLinksTable({ links }: { links: AffiliateDetailResponse['links'] }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <DetailSection title={`Link giới thiệu (${links.length})`} emptyMessage="Chưa có link nào.">
          {links.length > 0 ? (
            <DataTable columns={linkColumns} data={links} getRowKey={(l) => l.id} />
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}
