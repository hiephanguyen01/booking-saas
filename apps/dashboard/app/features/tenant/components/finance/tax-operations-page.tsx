import { useState } from 'react';
import { Link, useFetcher } from 'react-router';
import type {
  PartnerResponse,
  TaxFilingPeriodResponse,
  TaxFilingStatusDto,
  TaxWithholdingCertificateResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@booking/ui/components/ui/table';
import { ArrowLeft, FileCheck2, Landmark, ReceiptText, RefreshCw } from 'lucide-react';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { dashboardPaths } from '~/constants/paths';
import { formatDate, formatVnd } from '~/lib/format';
import { TaxDocumentUploadField } from './tax-document-upload-field';
import { TaxCertificateActions } from './tax-certificate-actions';

interface ActionResult {
  error?: string;
  message?: string;
}

const STATUS_LABEL: Record<TaxFilingStatusDto, string> = {
  draft: 'Bản nháp',
  submitted: 'Đã nộp tờ khai',
  paid: 'Đã nộp thuế',
};

const STATUS_VARIANT: Record<TaxFilingStatusDto, 'outline' | 'secondary' | 'default'> = {
  draft: 'outline',
  submitted: 'secondary',
  paid: 'default',
};

export function TaxOperationsPage({
  filings,
  certificates,
  partners,
  canManage,
  error,
}: {
  filings: TaxFilingPeriodResponse[];
  certificates: TaxWithholdingCertificateResponse[];
  partners: PartnerResponse[];
  canManage: boolean;
  error: string | null;
}) {
  const liability = sumTax(filings.filter((period) => period.status !== 'paid'));
  const paid = sumTax(filings.filter((period) => period.status === 'paid'));
  const eventCount = filings.reduce((sum, period) => sum + period.eventCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thuế đối tác"
        description="Khấu trừ được ghi nhận khi settlement được release sau khi cửa sổ tranh chấp kết thúc."
        actions={
          <Button asChild variant="outline">
            <Link to={dashboardPaths.tenant.finance}>
              <ArrowLeft className="size-4" /> Về tài chính
            </Link>
          </Button>
        }
      />

      <ErrorBanner error={error} />

      <section className="grid gap-3 md:grid-cols-3" aria-label="Tổng quan nghĩa vụ thuế">
        <SummaryCard
          icon={Landmark}
          label="Nghĩa vụ chưa tất toán"
          value={formatVnd(liability)}
          hint="VAT + PIT của kỳ nháp hoặc đã nộp tờ khai"
        />
        <SummaryCard
          icon={FileCheck2}
          label="Đã nộp cơ quan thuế"
          value={formatVnd(paid)}
          hint={`${filings.filter((period) => period.status === 'paid').length} kỳ đã tất toán`}
        />
        <SummaryCard
          icon={ReceiptText}
          label="Sự kiện đã đối soát"
          value={String(eventCount)}
          hint="Gồm settlement đã release và hoàn thuế đảo chiều"
        />
      </section>

      <FilingLedger filings={filings} canManage={canManage} />
      <CertificateRegister
        certificates={certificates}
        partners={partners.filter((partner) => partner.status === 'approved')}
        canManage={canManage}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="flex items-start justify-between gap-4 pt-5">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function FilingLedger({
  filings,
  canManage,
}: {
  filings: TaxFilingPeriodResponse[];
  canManage: boolean;
}) {
  const prepare = useFetcher<ActionResult>();
  const current = new Date();

  return (
    <Card>
      <CardHeader className="gap-4 border-b sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Sổ kê khai theo tháng</CardTitle>
          <CardDescription>
            Tổng hợp doanh thu thực tế, VAT 5% và PIT 2% đã ghi nhận theo từng kỳ.
          </CardDescription>
        </div>
        {canManage ? (
          <prepare.Form method="post" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="prepare" />
            <div className="grid gap-1">
              <Label htmlFor="tax-month" className="text-xs">
                Tháng
              </Label>
              <NativeSelect
                id="tax-month"
                name="taxMonth"
                defaultValue={String(current.getMonth() + 1)}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <NativeSelectOption key={month} value={month}>
                    Tháng {month}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="tax-year" className="text-xs">
                Năm
              </Label>
              <Input
                id="tax-year"
                name="taxYear"
                type="number"
                min={2026}
                max={2100}
                defaultValue={current.getFullYear()}
                className="w-28"
              />
            </div>
            <Button type="submit" disabled={prepare.state !== 'idle'}>
              <RefreshCw className="size-4" /> Lập kỳ
            </Button>
          </prepare.Form>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <ErrorBanner error={prepare.data?.error} />
        <SuccessBanner message={prepare.data?.message} />
        {filings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có kỳ kê khai. Khi lập kỳ, hệ thống gom các sự kiện hoàn thành dịch vụ chưa được kê
            khai.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kỳ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Doanh thu thực tế</TableHead>
                <TableHead className="text-right">VAT 5%</TableHead>
                <TableHead className="text-right">PIT 2%</TableHead>
                <TableHead className="text-right">Sự kiện</TableHead>
                <TableHead className="text-right">Vận hành</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filings.map((period) => (
                <FilingRow key={period.id} period={period} canManage={canManage} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function FilingRow({ period, canManage }: { period: TaxFilingPeriodResponse; canManage: boolean }) {
  const fetcher = useFetcher<ActionResult>();
  const [documentUploading, setDocumentUploading] = useState(false);
  const total = BigInt(period.vatAmount) + BigInt(period.pitAmount);
  const busy = fetcher.state !== 'idle';

  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">
        {String(period.taxMonth).padStart(2, '0')}/{period.taxYear}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[period.status]}>{STATUS_LABEL[period.status]}</Badge>
        {period.submissionReference ? (
          <p
            className="mt-1 max-w-40 truncate text-xs text-muted-foreground"
            title={period.submissionReference}
          >
            {period.submissionReference}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(period.taxableRevenue)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(period.vatAmount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatVnd(period.pitAmount)}</TableCell>
      <TableCell className="text-right tabular-nums">{period.eventCount}</TableCell>
      <TableCell className="text-right">
        {canManage && period.status === 'draft' ? (
          <details className="inline-block text-left">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              Nộp tờ khai
            </summary>
            <fetcher.Form
              method="post"
              className="mt-2 grid w-72 gap-2 rounded-md border bg-background p-3 shadow-sm"
            >
              <input type="hidden" name="intent" value="submit" />
              <input type="hidden" name="filingId" value={period.id} />
              <Label htmlFor={`submission-${period.id}`}>Mã tiếp nhận</Label>
              <Input
                id={`submission-${period.id}`}
                name="submissionReference"
                required
                maxLength={200}
                placeholder="Mã hồ sơ điện tử"
              />
              <ActionFeedback fetcher={fetcher} />
              <Button type="submit" size="sm" disabled={busy || total < 0n}>
                Xác nhận đã nộp
              </Button>
            </fetcher.Form>
          </details>
        ) : null}
        {canManage && period.status === 'submitted' ? (
          total > 0n ? (
            <details className="inline-block text-left">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                Ghi nhận nộp thuế
              </summary>
              <fetcher.Form
                method="post"
                className="mt-2 grid w-80 gap-2 rounded-md border bg-background p-3 shadow-sm"
              >
                <input type="hidden" name="intent" value="remit" />
                <input type="hidden" name="filingId" value={period.id} />
                <input type="hidden" name="vatAmount" value={period.vatAmount} />
                <input type="hidden" name="pitAmount" value={period.pitAmount} />
                <Label htmlFor={`payment-ref-${period.id}`}>Tham chiếu nộp tiền</Label>
                <Input
                  id={`payment-ref-${period.id}`}
                  name="paymentReference"
                  required
                  maxLength={200}
                />
                <Label htmlFor={`paid-date-${period.id}`}>Ngày nộp</Label>
                <Input id={`paid-date-${period.id}`} name="paidDate" type="date" required />
                <TaxDocumentUploadField
                  id={`evidence-${period.id}`}
                  label="Chứng từ nộp tiền (nếu có)"
                  disabled={busy}
                  onUploadingChange={setDocumentUploading}
                />
                <Label htmlFor={`note-${period.id}`}>Ghi chú (nếu có)</Label>
                <Input id={`note-${period.id}`} name="note" maxLength={1000} />
                <p className="text-xs text-muted-foreground">Tổng tất toán: {formatVnd(total)}</p>
                <ActionFeedback fetcher={fetcher} />
                <Button type="submit" size="sm" disabled={busy || documentUploading}>
                  Xác nhận đã nộp
                </Button>
              </fetcher.Form>
            </details>
          ) : (
            <span className="text-xs text-muted-foreground">Kỳ tín dụng — chuyển kỳ/hoàn sau</span>
          )
        ) : null}
        {period.status === 'paid' ? (
          <span className="text-xs text-muted-foreground">{formatDate(period.paidAt)}</span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function CertificateRegister({
  certificates,
  partners,
  canManage,
}: {
  certificates: TaxWithholdingCertificateResponse[];
  partners: PartnerResponse[];
  canManage: boolean;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [documentUploading, setDocumentUploading] = useState(false);
  const currentYear = new Date().getFullYear();
  const hasClosedTaxYear = currentYear > 2026;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chứng từ khấu trừ theo năm</CardTitle>
        <CardDescription>
          Phát hành sau khi các kỳ liên quan đã nộp thuế; hệ thống tự lưu và kiểm tra tính toàn vẹn
          của tệp PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canManage && hasClosedTaxYear ? (
          <fetcher.Form
            method="post"
            className="grid gap-3 rounded-md border bg-muted/20 p-4 lg:grid-cols-6 lg:items-end"
          >
            <input type="hidden" name="intent" value="issue-certificate" />
            <div className="grid gap-1.5 lg:col-span-2">
              <Label htmlFor="certificate-partner">Đối tác đã duyệt</Label>
              <NativeSelect id="certificate-partner" name="partnerId" required className="w-full">
                <NativeSelectOption value="">Chọn đối tác</NativeSelectOption>
                {partners.map((partner) => (
                  <NativeSelectOption key={partner.id} value={partner.id}>
                    {partner.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="certificate-year">Năm</Label>
              <Input
                id="certificate-year"
                name="taxYear"
                type="number"
                min={2026}
                max={currentYear - 1}
                defaultValue={currentYear - 1}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="certificate-number">Số chứng từ</Label>
              <Input id="certificate-number" name="certificateNumber" required maxLength={100} />
            </div>
            <div className="lg:col-span-2">
              <TaxDocumentUploadField
                id="certificate-file"
                label="Tệp chứng từ"
                required
                disabled={fetcher.state !== 'idle'}
                onUploadingChange={setDocumentUploading}
              />
            </div>
            <div className="lg:col-span-6">
              <ActionFeedback fetcher={fetcher} />
            </div>
            <Button
              type="submit"
              className="lg:col-span-6 lg:w-fit"
              disabled={fetcher.state !== 'idle' || documentUploading || partners.length === 0}
            >
              <FileCheck2 className="size-4" /> Phát hành chứng từ
            </Button>
          </fetcher.Form>
        ) : canManage ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground dark:bg-warning/15 dark:text-warning">
            Chưa có năm thuế đã đóng. Chứng từ năm 2026 chỉ có thể phát hành từ ngày 01/01/2027, sau
            khi toàn bộ sự kiện đã nằm trong kỳ kê khai đã nộp thuế.
          </p>
        ) : null}

        {certificates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa phát hành chứng từ khấu trừ nào.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đối tác</TableHead>
                <TableHead>Năm / phiên bản</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Số chứng từ</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">PIT</TableHead>
                <TableHead>Phát hành</TableHead>
                <TableHead className="text-right">Chứng từ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.map((certificate) => (
                <TableRow key={certificate.id}>
                  <TableCell className="font-medium">{certificate.partnerName}</TableCell>
                  <TableCell>
                    <span className="tabular-nums">{certificate.taxYear}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      v{certificate.version}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={certificate.status === 'issued' ? 'default' : 'secondary'}>
                      {certificate.status === 'issued' ? 'Đang hiệu lực' : 'Đã huỷ'}
                    </Badge>
                    {certificate.voidReason ? (
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        {certificate.voidReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {certificate.certificateNumber ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVnd(certificate.vatAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVnd(certificate.pitAmount)}
                  </TableCell>
                  <TableCell>{formatDate(certificate.issuedAt)}</TableCell>
                  <TableCell className="text-right">
                    <TaxCertificateActions certificate={certificate} canManage={canManage} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActionFeedback({ fetcher }: { fetcher: { data?: ActionResult } }) {
  return (
    <>
      <ErrorBanner error={fetcher.data?.error} />
      <SuccessBanner message={fetcher.data?.message} />
    </>
  );
}

function sumTax(periods: TaxFilingPeriodResponse[]): bigint {
  return periods.reduce(
    (sum, period) => sum + BigInt(period.vatAmount) + BigInt(period.pitAmount),
    0n,
  );
}
