import type { ReactNode } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import {
  addDomainInputSchema,
  type DomainDnsCheckResponse,
  type DomainResponse,
  type TenancyConfigResponse,
  type TenantDomainKind,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe2,
  Radar,
  RefreshCw,
  Star,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { formatDate } from '~/lib/format';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { CopyableCode } from '~/components/copyable-code';
import { DateTimeValue } from '~/components/date-time-value';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { domainFields } from './settings-fields';

type DomainActionIntent =
  | 'set-primary-domain'
  | 'verify-domain'
  | 'dns-check-domain'
  | 'delete-domain';

/** The last "Kiểm tra kết nối" result, scoped to the row it was run on. */
export interface DomainDnsCheckState {
  domainId: string;
  result: DomainDnsCheckResponse;
}

/**
 * Raw domain-action response from `handleSettingsAction`, before either card
 * decides whether it's the one that should render it. The route passes the
 * *same* object to both the storefront and dashboard card (it has no way to
 * know which one a tenant meant), so every branch of the action echoes `kind`
 * back and each card compares it to its own `kind` prop to decide ownership.
 *
 * `kind`, not `domainId`, is what ownership is decided on: a successful delete
 * removes the row from `domains`, so by the time this re-renders with fresh
 * loader data, `domainId` no longer matches anything in *either* card's `rows`
 * — deciding ownership from `domainId` made a delete's confirmation render in
 * neither card. `kind` has no such lifetime problem, since it isn't derived
 * from data that the action's own effect can invalidate.
 */
export interface DomainActionResult {
  form: 'domain' | 'domain-verify' | 'domain-dns-check' | 'domain-primary' | 'domain-delete';
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Present on every branch. Decides which card owns this response. */
  kind: TenantDomainKind;
  /** Present on row-action responses. Scopes the DNS-check inline result to
   * one row (`DomainDnsCheckState`) — a separate concern from banner ownership,
   * so this stays a plain identifier and is never used to decide ownership. */
  domainId?: string;
  /** Present on a successful `form: 'domain-dns-check'`. */
  dnsCheck?: DomainDnsCheckResponse;
}

export function TenantDomainsCard({
  kind,
  domains,
  tenancyConfig,
  loadError,
  readOnly,
  domainActionResult,
  dnsCheck,
}: {
  kind: TenantDomainKind;
  domains: DomainResponse[] | null;
  tenancyConfig: TenancyConfigResponse | null;
  loadError: string | null;
  readOnly: boolean;
  domainActionResult: DomainActionResult | null;
  dnsCheck: DomainDnsCheckState | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const rows = (domains ?? []).filter((domain) => domain.kind === kind);

  // Both cards read the same page-wide `useNavigation()` — without this check,
  // submitting in one would visibly disable the other's buttons too. Row actions
  // submit `{ intent, domainId }` as urlencoded FormData; the add-domain form
  // submits JSON carrying `kind`. A pending navigation only belongs to this card
  // if its domainId is one of this card's own rows, or its kind matches this
  // card's kind.
  const pendingDomainId = navigation.formData?.get('domainId');
  const pendingKind =
    navigation.json && typeof navigation.json === 'object' && !Array.isArray(navigation.json)
      ? (navigation.json as Record<string, unknown>).kind
      : undefined;
  const ownSubmissionInFlight =
    navigation.state !== 'idle' &&
    (rows.some((row) => row.id === pendingDomainId) || pendingKind === kind);

  const { busy, run } = useSubmissionGuard(ownSubmissionInFlight ? navigation.state : 'idle');

  const submitDomainAction = (intent: DomainActionIntent, domainId: string): void => {
    // `kind` travels along so the action can echo it back — see `ownsResult`
    // below for why banner ownership can't be decided from `domainId` alone.
    run(() => submit({ intent, domainId, kind }, { method: 'post' }));
  };

  // Same root cause as the busy-state scoping above: `domainActionResult` is one
  // shared value handed to both cards. Every branch of the action echoes `kind`
  // now (not just add-domain), so ownership is a single comparison — and,
  // importantly, one that doesn't depend on the row still being in `rows`. A
  // successful delete triggers the route's default revalidation, so by the time
  // this re-renders with the new `domains`, the deleted row is gone from *both*
  // cards' `rows`; deciding ownership via `rows.some(domainId)` (the round-1
  // approach) made a successful delete's confirmation render in neither card.
  const ownsResult = domainActionResult?.kind === kind;
  const result = ownsResult ? domainActionResult : null;

  const domainError = result?.form === 'domain' && !result.ok ? (result.error ?? null) : null;
  const domainFieldErrors =
    result?.form === 'domain' && !result.ok ? (result.fieldErrors ?? null) : null;
  const actionError =
    result && result.form !== 'domain' && !result.ok ? (result.error ?? null) : null;
  const successMessage =
    result?.ok
      ? result.form === 'domain'
        ? 'Đã thêm tên miền. Hãy cấu hình DNS để hoàn tất xác minh.'
        : result.form === 'domain-verify'
          ? 'Đã gửi yêu cầu kiểm tra DNS. Trạng thái sẽ cập nhật khi bản ghi được tìm thấy.'
          : result.form === 'domain-primary'
            ? 'Đã cập nhật tên miền chính.'
            : result.form === 'domain-delete'
              ? 'Đã xoá tên miền.'
              : null // 'domain-dns-check' success already renders inline per-row, no banner
      : null;

  const copy =
    kind === 'dashboard'
      ? {
          title: 'Tên miền trang quản trị',
          description:
            'Địa chỉ đội ngũ của bạn dùng để đăng nhập và vận hành. Tên miền phải bắt đầu bằng "admin.".',
          placeholder: 'admin.tencuaban.vn',
        }
      : {
          title: 'Tên miền cửa hàng',
          description: 'Địa chỉ khách hàng truy cập để xem và đặt dịch vụ.',
          placeholder: 'datcho.tencuaban.vn',
        };

  return (
    <Card className="shadow-none" aria-busy={busy}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="size-4 text-primary" aria-hidden="true" /> {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ErrorBanner error={loadError ?? actionError} />
        <SuccessBanner message={successMessage} />

        {!loadError && domains && rows.length > 0 ? (
          <ul className="space-y-3">
            {rows.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
                tenancyConfig={tenancyConfig}
                dnsCheck={dnsCheck?.domainId === domain.id ? dnsCheck.result : null}
                busy={busy}
                readOnly={readOnly}
                onAction={submitDomainAction}
              />
            ))}
          </ul>
        ) : !loadError && domains ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-8 text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Globe2 className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold">Chưa có tên miền riêng</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Thêm tên miền bạn sở hữu. Hệ thống vẫn tiếp tục hoạt động trên địa chỉ mặc định trong
              lúc chờ xác minh.
            </p>
          </div>
        ) : null}

        <fieldset
          disabled={readOnly || busy || Boolean(loadError)}
          className="min-w-0 rounded-xl border bg-muted/20 p-4 disabled:opacity-60 sm:p-5"
        >
          <div className="mb-5">
            <h3 className="text-sm font-semibold">Thêm tên miền</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Chỉ nhập hostname, không nhập giao thức hoặc đường dẫn. Ví dụ: {copy.placeholder}.
            </p>
          </div>
          <GenericForm
            schema={addDomainInputSchema}
            fields={domainFields(copy.placeholder)}
            columns={2}
            defaultValues={{ isPrimary: false, kind }}
            submitLabel="Thêm tên miền"
            submitPendingLabel="Đang thêm..."
            serverError={domainError}
            fieldErrors={domainFieldErrors}
          />
        </fieldset>
      </CardContent>
    </Card>
  );
}

function DomainRow({
  domain,
  tenancyConfig,
  dnsCheck,
  busy,
  readOnly,
  onAction,
}: {
  domain: DomainResponse;
  tenancyConfig: TenancyConfigResponse | null;
  dnsCheck: DomainDnsCheckResponse | null;
  busy: boolean;
  readOnly: boolean;
  onAction: (intent: DomainActionIntent, domainId: string) => void;
}) {
  const verified = Boolean(domain.verifiedAt);
  const url = storefrontUrl(domain.hostname);
  // Two independent conditions, and a tenant hits the second one blind: TXT
  // proves ownership, pointing the record is what makes the domain load. Keep
  // the pointing step on screen until a check confirms it — including for a
  // domain that is already "Đã xác minh".
  const pointed = dnsCheck?.pointsToUs === true;

  return (
    <li className="rounded-xl border bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {domain.hostname}
            </a>
            {domain.isPrimary ? <Badge variant="secondary">Tên miền chính</Badge> : null}
            <Badge
              variant="outline"
              className={
                verified
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-warning/35 bg-warning/10 text-warning-foreground'
              }
            >
              {verified ? 'Đã xác minh' : 'Chờ xác minh'}
            </Badge>
          </div>
          {verified ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
              Xác minh ngày {formatDate(domain.verifiedAt)}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5 text-warning" aria-hidden="true" />
              Đang chờ bản ghi DNS TXT
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {verified && !domain.isPrimary ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || readOnly}
              onClick={() => onAction('set-primary-domain', domain.id)}
            >
              <Star className="size-3.5" /> Đặt làm chính
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noreferrer">
              Mở trang <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <DeleteDomainDialog
            hostname={domain.hostname}
            kind={domain.kind}
            disabled={busy || readOnly}
            onConfirm={() => onAction('delete-domain', domain.id)}
          />
        </div>
      </div>

      {!verified && domain.verification ? (
        <DomainStep
          label={pointed ? 'Chứng minh sở hữu' : 'Bước 1 · Chứng minh sở hữu'}
          description="Tạo bản ghi TXT dưới đây trong trang quản trị DNS của bạn. Một số nhà cung cấp chỉ nhận phần đứng trước tên miền ở ô tên bản ghi."
        >
          <dl className="grid gap-3 text-xs sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
            <dt className="text-muted-foreground">Tên bản ghi</dt>
            <dd className="min-w-0">
              <CopyableCode
                value={domain.verification.recordName}
                label={`tên bản ghi TXT của ${domain.hostname}`}
                className="max-w-full"
              />
            </dd>
            <dt className="text-muted-foreground">Loại bản ghi</dt>
            <dd className="font-mono font-semibold">{domain.verification.recordType}</dd>
            <dt className="text-muted-foreground">Giá trị</dt>
            <dd className="min-w-0">
              <CopyableCode
                value={domain.verification.recordValue}
                label={`giá trị TXT của ${domain.hostname}`}
                className="max-w-full"
              />
            </dd>
          </dl>
          <Button
            type="button"
            className="mt-4"
            variant="outline"
            size="sm"
            disabled={busy || readOnly}
            onClick={() => onAction('verify-domain', domain.id)}
          >
            <RefreshCw className="size-3.5" /> Kiểm tra lại DNS
          </Button>
        </DomainStep>
      ) : null}

      {!pointed ? (
        <DomainStep
          label={!verified && domain.verification ? 'Bước 2 · Trỏ tên miền' : 'Trỏ tên miền'}
          description="Xác minh chỉ chứng minh bạn sở hữu tên miền. Để khách mở được trang, tên miền còn phải trỏ về BookingOS bằng một trong hai bản ghi dưới đây."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DnsTargetBlock
              title="Tên miền con"
              hint="Ví dụ booking.cuahang.vn"
              recordType="CNAME"
              value={tenancyConfig?.storefrontCname || null}
              hostname={domain.hostname}
            />
            <DnsTargetBlock
              title="Tên miền gốc"
              hint="Ví dụ cuahang.vn — bản ghi gốc không dùng được CNAME"
              recordType="A"
              value={tenancyConfig?.storefrontIpv4 || null}
              hostname={domain.hostname}
            />
          </div>
          <Button
            type="button"
            className="mt-4"
            variant="outline"
            size="sm"
            disabled={busy || readOnly}
            onClick={() => onAction('dns-check-domain', domain.id)}
          >
            <Radar className="size-3.5" /> Kiểm tra kết nối
          </Button>
          {dnsCheck ? <DnsCheckResult check={dnsCheck} /> : null}
        </DomainStep>
      ) : dnsCheck ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-xs text-success">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">Tên miền đã trỏ về BookingOS.</span>
          <span className="text-success/80">
            Kiểm tra lúc <DateTimeValue iso={dnsCheck.checkedAt} className="text-xs" />
          </span>
        </div>
      ) : null}
    </li>
  );
}

/** One numbered instruction block inside a domain row. */
function DomainStep({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border bg-muted/35 p-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Where one flavour of hostname (subdomain vs apex) must point. */
function DnsTargetBlock({
  title,
  hint,
  recordType,
  value,
  hostname,
}: {
  title: string;
  hint: string;
  recordType: 'CNAME' | 'A';
  value: string | null;
  hostname: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-0.5 text-[0.6875rem] leading-4 text-muted-foreground">{hint}</p>
      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <dt className="w-16 shrink-0 text-muted-foreground">Loại</dt>
          <dd className="font-mono font-semibold">{recordType}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="w-16 shrink-0 text-muted-foreground">Trỏ về</dt>
          <dd className="min-w-0">
            {value ? (
              <CopyableCode
                value={value}
                label={`đích ${recordType} của ${hostname}`}
                className="max-w-full"
              />
            ) : (
              <span className="text-muted-foreground">
                Chưa cấu hình — liên hệ quản trị nền tảng.
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** What DNS answered just now, in the row it was checked from. */
function DnsCheckResult({ check }: { check: DomainDnsCheckResponse }) {
  const observed =
    check.observedCname !== null
      ? `Đang trỏ CNAME về ${check.observedCname}.`
      : check.observedIpv4.length > 0
        ? `Đang trỏ về ${check.observedIpv4.join(', ')}.`
        : 'Chưa tìm thấy bản ghi A hoặc CNAME nào cho tên miền này.';

  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs text-warning-foreground">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">Tên miền chưa trỏ về BookingOS.</p>
        <p>{observed}</p>
        <p className="text-warning-foreground/80">
          Thay đổi DNS có thể mất tới vài giờ để lan truyền. Kiểm tra lúc{' '}
          <DateTimeValue iso={check.checkedAt} className="text-xs" />
        </p>
      </div>
    </div>
  );
}

function DeleteDomainDialog({
  hostname,
  kind,
  disabled,
  onConfirm,
}: {
  hostname: string;
  kind: TenantDomainKind;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          disabled={disabled}
          aria-label={`Xoá ${hostname}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá tên miền {hostname}?</AlertDialogTitle>
          <AlertDialogDescription>
            {kind === 'dashboard'
              ? 'Đội ngũ của bạn sẽ không thể đăng nhập bằng địa chỉ này sau khi xoá.'
              : 'Khách sẽ không thể truy cập storefront bằng địa chỉ này sau khi xoá.'}{' '}
            Thao tác không ảnh hưởng dữ liệu đặt chỗ hoặc nội dung cửa hàng.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Giữ lại</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={disabled}>
            Xoá tên miền
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function storefrontUrl(hostname: string): string {
  return `${hostname.includes('localhost') || hostname.startsWith('127.') ? 'http' : 'https'}://${hostname}`;
}
