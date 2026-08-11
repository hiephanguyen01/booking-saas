import type { PartnerTaxWithholdingCertificateResponse } from '@booking/contracts';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import { ExternalLink, FileText } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { dashboardPaths } from '~/constants/paths';
import { formatDate } from '~/lib/format';

const columns: DataTableColumn<PartnerTaxWithholdingCertificateResponse>[] = [
  {
    header: 'Năm / phiên bản',
    cell: (certificate) => (
      <span className="font-medium tabular-nums">
        {certificate.taxYear}{' '}
        <span className="text-xs text-muted-foreground">v{certificate.version}</span>
      </span>
    ),
  },
  {
    header: 'Trạng thái',
    cell: (certificate) => (
      <div className="space-y-1">
        <Badge variant={certificate.status === 'issued' ? 'default' : 'secondary'}>
          {certificate.status === 'issued' ? 'Đang hiệu lực' : 'Đã huỷ'}
        </Badge>
        {certificate.voidReason ? (
          <p className="max-w-xs text-xs text-muted-foreground">{certificate.voidReason}</p>
        ) : null}
      </div>
    ),
  },
  {
    header: 'Số chứng từ',
    cell: (certificate) => (
      <span className="font-mono text-xs">{certificate.certificateNumber ?? '—'}</span>
    ),
  },
  {
    header: 'Thuế đã khấu trừ',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (certificate) => (
      <div className="space-y-1 text-sm tabular-nums">
        <p>
          VAT: <Money value={certificate.vatAmount} />
        </p>
        <p>
          PIT: <Money value={certificate.pitAmount} />
        </p>
      </div>
    ),
  },
  {
    header: 'Phát hành',
    cell: (certificate) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDate(certificate.issuedAt)}
      </span>
    ),
  },
  {
    header: '',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (certificate) =>
      certificate.status === 'issued' ? (
        <Button asChild size="sm" variant="outline">
          <Link
            to={dashboardPaths.partner.taxCertificateDownload(certificate.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-4" /> Xem PDF
          </Link>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Không còn hiệu lực</span>
      ),
  },
];

export function PartnerTaxCertificates({
  certificates,
  error,
}: {
  certificates: PartnerTaxWithholdingCertificateResponse[];
  error: string | null;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Chứng từ khấu trừ thuế</h2>
      </div>
      <ErrorBanner error={error} />
      <DataTable
        columns={columns}
        data={certificates}
        getRowKey={(certificate) => certificate.id}
        emptyMessage="Tenant chưa phát hành chứng từ khấu trừ nào cho bạn."
      />
    </section>
  );
}
