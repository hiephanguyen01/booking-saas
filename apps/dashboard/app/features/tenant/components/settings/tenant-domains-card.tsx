import { Form } from 'react-router';
import { addDomainInputSchema, type DomainResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { CheckCircle2, Clock, Globe, Trash2 } from 'lucide-react';
import { formatDate } from '~/lib/format';
import { ErrorBanner } from '~/components/action-feedback';
import { useBusy } from '~/hooks/use-busy';
import { domainFields } from './settings-fields';

/** Custom-domain mapping card: the domain list (verify/delete) + the add form. */
export function TenantDomainsCard({
  domains,
  readOnly,
  verifyError,
  domainError,
  domainFieldErrors,
}: {
  domains: DomainResponse[] | null;
  readOnly: boolean;
  verifyError: string | null;
  domainError: string | null;
  domainFieldErrors: Record<string, string[]> | null;
}) {
  const busy = useBusy();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4" /> Tên miền
        </CardTitle>
        <CardDescription>Ánh xạ tên miền riêng tới storefront của bạn (§6.1).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ErrorBanner error={verifyError} />

        {domains && domains.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {domains.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{d.hostname}</span>
                    {d.isPrimary ? <Badge variant="secondary">Chính</Badge> : null}
                  </div>
                  {d.verifiedAt ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" /> Đã xác minh · {formatDate(d.verifiedAt)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <Clock className="size-3.5" /> Chờ xác minh TXT
                    </span>
                  )}
                  {!d.verifiedAt && d.verificationToken ? (
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      TXT: {d.verificationToken}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {!d.verifiedAt ? (
                    <Form method="post">
                      <input type="hidden" name="intent" value="verify-domain" />
                      <input type="hidden" name="domainId" value={d.id} />
                      <Button type="submit" variant="outline" size="sm" disabled={busy || readOnly}>
                        Xác minh
                      </Button>
                    </Form>
                  ) : null}
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!confirm(`Xoá tên miền ${d.hostname}?`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="delete-domain" />
                    <input type="hidden" name="domainId" value={d.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={busy || readOnly}
                      aria-label={`Xoá ${d.hostname}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có tên miền riêng nào.</p>
        )}

        <fieldset
          disabled={readOnly}
          className="min-w-0 space-y-3 rounded-md border border-dashed p-4 disabled:opacity-60"
        >
          <h3 className="text-sm font-medium">Thêm tên miền</h3>
          <GenericForm
            schema={addDomainInputSchema}
            fields={domainFields}
            columns={2}
            defaultValues={{ isPrimary: false }}
            submitLabel="Thêm tên miền"
            serverError={domainError}
            fieldErrors={domainFieldErrors}
          />
        </fieldset>
      </CardContent>
    </Card>
  );
}
