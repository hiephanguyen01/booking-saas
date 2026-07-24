import { useNavigation, useSubmit } from 'react-router';
import { addDomainInputSchema, type DomainResponse } from '@booking/contracts';
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
import { CheckCircle2, Clock, ExternalLink, Globe2, RefreshCw, Star, Trash2 } from 'lucide-react';
import { formatDate } from '~/lib/format';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { CopyableCode } from '~/components/copyable-code';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { domainFields } from './settings-fields';

type DomainActionIntent = 'set-primary-domain' | 'verify-domain' | 'delete-domain';

export function TenantDomainsCard({
  domains,
  loadError,
  readOnly,
  actionError,
  domainError,
  domainFieldErrors,
  successMessage,
}: {
  domains: DomainResponse[] | null;
  loadError: string | null;
  readOnly: boolean;
  actionError: string | null;
  domainError: string | null;
  domainFieldErrors: Record<string, string[]> | null;
  successMessage: string | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy, run } = useSubmissionGuard(navigation.state);

  const submitDomainAction = (intent: DomainActionIntent, domainId: string): void => {
    run(() => submit({ intent, domainId }, { method: 'post' }));
  };

  return (
    <Card className="shadow-none" aria-busy={busy}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="size-4 text-primary" aria-hidden="true" /> Tên miền storefront
        </CardTitle>
        <CardDescription>
          Kết nối địa chỉ riêng để khách truy cập cửa hàng bằng tên miền thương hiệu của bạn.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ErrorBanner error={loadError ?? actionError} />
        <SuccessBanner message={successMessage} />

        {!loadError && domains && domains.length > 0 ? (
          <ul className="space-y-3">
            {domains.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
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
              Thêm tên miền bạn sở hữu. Storefront vẫn tiếp tục hoạt động trên địa chỉ mặc định
              trong lúc chờ xác minh.
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
              Chỉ nhập hostname, không nhập giao thức hoặc đường dẫn. Ví dụ: booking.cuahang.vn.
            </p>
          </div>
          <GenericForm
            schema={addDomainInputSchema}
            fields={domainFields}
            columns={2}
            defaultValues={{ isPrimary: false }}
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
  busy,
  readOnly,
  onAction,
}: {
  domain: DomainResponse;
  busy: boolean;
  readOnly: boolean;
  onAction: (intent: DomainActionIntent, domainId: string) => void;
}) {
  const verified = Boolean(domain.verifiedAt);
  const url = storefrontUrl(domain.hostname);

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
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-warning/35 bg-warning/10 text-warning-foreground'
              }
            >
              {verified ? 'Đã xác minh' : 'Chờ xác minh'}
            </Badge>
          </div>
          {verified ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2
                className="size-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
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
            disabled={busy || readOnly}
            onConfirm={() => onAction('delete-domain', domain.id)}
          />
        </div>
      </div>

      {!verified && domain.verificationToken ? (
        <div className="mt-4 rounded-lg border bg-muted/35 p-4">
          <p className="text-sm font-semibold">Cấu hình DNS</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Tạo một bản ghi TXT trong trang quản trị DNS. Nhà cung cấp có thể yêu cầu nhập hostname
            hoặc ký hiệu @ ở trường tên bản ghi.
          </p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
            <dt className="text-muted-foreground">Loại bản ghi</dt>
            <dd className="font-mono font-semibold">TXT</dd>
            <dt className="text-muted-foreground">Giá trị</dt>
            <dd className="min-w-0">
              <CopyableCode
                value={domain.verificationToken}
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
        </div>
      ) : null}
    </li>
  );
}

function DeleteDomainDialog({
  hostname,
  disabled,
  onConfirm,
}: {
  hostname: string;
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
            Khách sẽ không thể truy cập storefront bằng địa chỉ này sau khi xoá. Thao tác không ảnh
            hưởng dữ liệu đặt chỗ hoặc nội dung cửa hàng.
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
