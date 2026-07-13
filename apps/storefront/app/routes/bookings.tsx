import { data, Form, Link } from 'react-router';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import type { Route } from './+types/bookings';
import { requestBookingOtp } from '../lib/booking.server';
import { readRecentCodes } from '../lib/recent.server';
import { useT } from '../lib/i18n';

export function meta() {
  return [{ title: 'Bookings' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return { recent: readRecentCodes(request) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const code = String(form.get('code') ?? '').trim();
  if (!code) return data({ sent: false, code: '', devOtp: null, error: 'MISSING_CODE' });

  const result = await requestBookingOtp(request, code);
  if (!result.ok) {
    return data({ sent: false, code, devOtp: null, error: result.error ?? 'INVALID_CODE' });
  }
  return data({ sent: true, code, devOtp: result.data?.devOtp ?? null, error: null });
}

export default function Bookings({ loaderData, actionData }: Route.ComponentProps) {
  const { recent } = loaderData;
  const { t } = useT();
  const sent = actionData?.sent ?? false;

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">{t('lookup.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('lookup.subtitle')}</p>

      <Card className="mt-6 rounded-2xl border-border">
        <CardContent className="p-6">
          {sent ? (
            <VerifyForm code={actionData!.code} devOtp={actionData!.devOtp} />
          ) : (
            <RequestForm error={actionData?.error ?? null} />
          )}
        </CardContent>
      </Card>

      <RecentList recent={recent} />
    </div>
  );
}

function RequestForm({ error }: { error: string | null }) {
  const { t } = useT();
  return (
    <Form method="post" className="space-y-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('lookup.codeLabel')}</span>
        <Input name="code" placeholder={t('lookup.codePlaceholder')} className="uppercase" autoFocus />
      </label>
      {error ? <p className="text-sm text-destructive">{t('lookup.invalidCode')}</p> : null}
      <Button type="submit" className="h-11 w-full">
        {t('lookup.sendOtp')}
      </Button>
    </Form>
  );
}

/** After the OTP email is sent, submit code+OTP as a GET to the detail page. */
function VerifyForm({ code, devOtp }: { code: string; devOtp: string | null }) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('lookup.otpSent')}</p>
      {devOtp ? (
        <p className="text-xs text-muted-foreground">{t('lookup.otpHintDev', { otp: devOtp })}</p>
      ) : null}
      <Form method="get" action={`/bookings/${encodeURIComponent(code)}`} className="space-y-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t('lookup.otpLabel')}</span>
          <Input name="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus />
        </label>
        <Button type="submit" className="h-11 w-full">
          {t('lookup.verify')}
        </Button>
      </Form>
    </div>
  );
}

function RecentList({ recent }: { recent: string[] }) {
  const { t } = useT();
  return (
    <div className="mt-8">
      <h2 className="mb-2 text-sm font-semibold text-foreground">{t('lookup.recentTitle')}</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('lookup.recentEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {recent.map((code) => (
            <li key={code}>
              <Link
                to={`/bookings/${encodeURIComponent(code)}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted"
              >
                <span className="font-mono font-semibold">{code}</span>
                <span className="text-muted-foreground">{t('booking.viewDetails')} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
