import type { FormEvent } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { Globe, ShieldCheck, Trash2 } from 'lucide-react';
import { addDomainInputSchema, type AddDomainInput, type DomainResponse } from '@booking/contracts';
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

const domainFields: FieldConfig<AddDomainInput>[] = [
  { name: 'hostname', type: 'text', label: 'Tên miền', placeholder: 'booking.tenant.com' },
  { name: 'isPrimary', type: 'checkbox', label: 'Đặt làm tên miền chính' },
];

/** One domain row: hostname, verification state + TXT record, verify/remove quick actions. */
function DomainListItem({
  domain,
  busy,
  onSubmit,
}: {
  domain: DomainResponse;
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
          <span
            className={domain.verifiedAt ? 'text-success' : 'text-warning'}
          >
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
          {domain.verificationToken ? (
            <div className="space-y-1.5 rounded-md bg-muted/40 p-2 text-xs">
              <p className="text-muted-foreground">Thêm bản ghi DNS TXT sau rồi bấm “Xác minh”:</p>
              <CopyableCode value={domain.verificationToken} label="bản ghi TXT" />
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
  busy,
  customDomainAllowed,
  serverError,
  fieldErrors,
}: {
  domains: DomainResponse[];
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
        <CardDescription>Gắn tên miền riêng và xác minh qua bản ghi DNS TXT.</CardDescription>
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
                defaultValues={{ hostname: '', isPrimary: false }}
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
