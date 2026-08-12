import type { FormEvent } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { Globe, Radar, ShieldCheck, Trash2 } from 'lucide-react';
import {
  addDomainInputSchema,
  type AddDomainInput,
  type DomainDnsCheckResponse,
  type DomainResponse,
  type TenancyConfigResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { CopyableCode } from '~/components/copyable-code';
import { DateTimeValue } from '~/components/date-time-value';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

/**
 * No `isPrimary` here: a freshly added custom domain always starts unverified,
 * and `AddDomainUseCase` now refuses `isPrimary: true` outright — offering the
 * checkbox would just be a guaranteed-to-fail trap (see `settings-fields.ts`'s
 * matching note on the tenant screen's own add-domain form). Making an
 * already-verified domain primary stays a `set-primary-domain` row action.
 *
 * `kind` DOES belong here, unlike the tenant screen's two-cards-by-`kind`
 * layout: this is the platform admin's one-card view of a tenant's domains, so
 * the admin has to say which surface a new hostname is for. Without it,
 * `addDomainInputSchema` defaulted to `storefront` and an admin trying to
 * provision `admin.custom.vn` on a tenant's behalf got an untranslated
 * `ADMIN_PREFIX_RESERVED` 400 with no way to succeed.
 */
const domainFields: FieldConfig<AddDomainInput>[] = [
  { name: 'hostname', type: 'text', label: 'Tên miền', placeholder: 'booking.tenant.com' },
  {
    name: 'kind',
    type: 'select',
    label: 'Loại tên miền',
    options: [
      { label: 'Cửa hàng (storefront)', value: 'storefront' },
      { label: 'Trang quản trị (dashboard)', value: 'dashboard' },
    ],
  },
];

/** The last DNS check run from this card, scoped to the domain it was run on. */
export interface AdminDomainDnsCheck {
  domainId: string;
  result: DomainDnsCheckResponse;
}

/** One domain row: hostname, verification state + TXT record, verify/point/remove actions. */
function DomainListItem({
  domain,
  tenancyConfig,
  dnsCheck,
  busy,
  onSubmit,
}: {
  domain: DomainResponse;
  tenancyConfig: TenancyConfigResponse | null;
  dnsCheck: DomainDnsCheckResponse | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <li className="space-y-2 rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{domain.hostname}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs">
          {domain.isPrimary ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Chính</span>
          ) : null}
          <span className={domain.verifiedAt ? 'text-success' : 'text-warning'}>
            {domain.verifiedAt ? 'Đã xác minh' : 'Chờ xác minh'}
          </span>
        </span>
      </div>
      {domain.verifiedAt ? (
        <p className="text-xs text-muted-foreground">
          Xác minh lúc <DateTimeValue iso={domain.verifiedAt} className="text-xs" />
        </p>
      ) : (
        <div className="space-y-2">
          {domain.verification ? (
            <div className="space-y-1.5 rounded-md bg-muted/40 p-2 text-xs">
              <p className="text-muted-foreground">Bản ghi TXT tenant phải tạo:</p>
              <dl className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <dt className="w-12 shrink-0 text-muted-foreground">Tên</dt>
                  <dd className="min-w-0">
                    <CopyableCode value={domain.verification.recordName} label="tên bản ghi TXT" />
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-12 shrink-0 text-muted-foreground">Loại</dt>
                  <dd className="font-mono font-semibold">{domain.verification.recordType}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-12 shrink-0 text-muted-foreground">Giá trị</dt>
                  <dd className="min-w-0">
                    <CopyableCode value={domain.verification.recordValue} label="giá trị TXT" />
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
          <Form method="post" onSubmit={onSubmit}>
            <input type="hidden" name="intent" value="verify-domain" />
            <input type="hidden" name="domainId" value={domain.id} />
            <Button type="submit" variant="outline" size="sm" disabled={busy}>
              <ShieldCheck className="size-4" />
              Xác minh
            </Button>
          </Form>
        </div>
      )}

      {/* Verification and pointing are independent, so support needs both answers
          for any domain — including one that already shows "Đã xác minh". */}
      <div className="space-y-2 rounded-md bg-muted/40 p-2 text-xs">
        <p className="text-muted-foreground">Tên miền phải trỏ về:</p>
        <dl className="space-y-1.5">
          <div className="flex items-center gap-2">
            <dt className="w-12 shrink-0 text-muted-foreground">CNAME</dt>
            <dd className="min-w-0">
              {tenancyConfig?.storefrontCname ? (
                <CopyableCode value={tenancyConfig.storefrontCname} label="đích CNAME" />
              ) : (
                <span className="text-muted-foreground">chưa cấu hình</span>
              )}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-12 shrink-0 text-muted-foreground">A</dt>
            <dd className="min-w-0">
              {tenancyConfig?.storefrontIpv4 ? (
                <CopyableCode value={tenancyConfig.storefrontIpv4} label="đích A" />
              ) : (
                <span className="text-muted-foreground">chưa cấu hình</span>
              )}
            </dd>
          </div>
        </dl>
        <Form method="post" onSubmit={onSubmit}>
          <input type="hidden" name="intent" value="dns-check-domain" />
          <input type="hidden" name="domainId" value={domain.id} />
          <Button type="submit" variant="outline" size="sm" disabled={busy}>
            <Radar className="size-4" />
            Kiểm tra kết nối
          </Button>
        </Form>
        {dnsCheck ? (
          <p className={dnsCheck.pointsToUs ? 'text-success' : 'text-warning'}>
            {dnsCheck.pointsToUs
              ? 'Đã trỏ đúng về nền tảng.'
              : dnsCheck.observedCname !== null
                ? `Chưa trỏ đúng — đang trỏ CNAME về ${dnsCheck.observedCname}.`
                : dnsCheck.observedIpv4.length > 0
                  ? `Chưa trỏ đúng — đang trỏ về ${dnsCheck.observedIpv4.join(', ')}.`
                  : 'Chưa trỏ — không tìm thấy bản ghi A hoặc CNAME nào.'}{' '}
            <DateTimeValue iso={dnsCheck.checkedAt} className="text-xs" />
          </p>
        ) : null}
      </div>

      <Form method="post" className="pt-1" onSubmit={onSubmit}>
        <input type="hidden" name="intent" value="remove-domain" />
        <input type="hidden" name="domainId" value={domain.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="h-auto px-2 py-1 text-xs text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Xoá
        </Button>
      </Form>
    </li>
  );
}

/** "Tên miền" card: the domain list plus the add-domain GenericForm. */
export function TenantDomainsCard({
  domains,
  tenancyConfig,
  dnsCheck,
  busy,
  customDomainAllowed,
  serverError,
  fieldErrors,
}: {
  domains: DomainResponse[];
  tenancyConfig: TenancyConfigResponse | null;
  dnsCheck: AdminDomainDnsCheck | null;
  busy: boolean;
  customDomainAllowed: boolean;
  serverError: string | null;
  fieldErrors: Partial<Record<string, string[] | undefined>> | null;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy: guardedBusy, run } = useSubmissionGuard(navigation.state);
  const isBusy = busy || guardedBusy;

  const handleDomainAction = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Card aria-busy={isBusy}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4 text-muted-foreground" />
          Tên miền
        </CardTitle>
        <CardDescription>
          Gắn tên miền riêng, xác minh qua bản ghi DNS TXT và kiểm tra tên miền đã trỏ về nền tảng
          chưa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có tên miền.</p>
        ) : (
          <ul className="space-y-2">
            {domains.map((d) => (
              <DomainListItem
                key={d.id}
                domain={d}
                tenancyConfig={tenancyConfig}
                dnsCheck={dnsCheck?.domainId === d.id ? dnsCheck.result : null}
                busy={isBusy}
                onSubmit={handleDomainAction}
              />
            ))}
          </ul>
        )}

        <fieldset disabled={isBusy} className="contents">
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Thêm tên miền</p>
            {customDomainAllowed ? (
              <GenericForm
                schema={addDomainInputSchema}
                fields={domainFields}
                submitLabel="Thêm tên miền"
                serverError={serverError}
                fieldErrors={fieldErrors}
                defaultValues={{ hostname: '', kind: 'storefront' }}
              />
            ) : (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                Gói hiện tại không cho phép tên miền riêng. Nâng cấp gói của tenant để bật tính năng
                này.
              </p>
            )}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
