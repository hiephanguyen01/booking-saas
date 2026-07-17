import {
  bookingLookupInputSchema,
  bookingResponseSchema,
  type BookingLookupInput,
  type BookingResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { data, Form, Link } from 'react-router';
import { z } from 'zod';
import { apiGet } from '../lib/api.server';
import { getOptionalAuth } from '../lib/auth.server';
import { requestBookingOtp } from '../lib/booking.server';
import { NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import { readRecentCodes } from '../lib/recent.server';
import { dateLabelInTz, DEFAULT_TZ, timeInTz } from '../lib/time';
import { useLocale } from '../lib/use-locale';
import type { Route } from './+types/bookings';
import { errorStatus } from '../lib/http-status';

export function meta() {
  return [{ title: 'Bookings' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = getOptionalAuth();
  let myBookings: BookingResponse[] = [];
  if (auth) {
    const result = await apiGet<BookingResponse[]>(
      request,
      '/public/my-bookings',
      auth.session.accessToken,
      {
        schema: z.array(bookingResponseSchema),
      },
    );
    if (result.ok && result.data) myBookings = result.data;
  }
  return { recent: readRecentCodes(request), myBookings };
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = bookingLookupInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return data(
      {
        sent: false,
        code: '',
        devOtp: null,
        error: null,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const code = parsed.data.code.toUpperCase();

  const result = await requestBookingOtp(request, code);
  if (!result.ok) {
    return data(
      {
        sent: false,
        code,
        devOtp: null,
        error: result.error ?? 'INVALID_CODE',
        fieldErrors: null,
      },
      { status: errorStatus(result.status) },
    );
  }
  return data({
    sent: true,
    code,
    devOtp: result.data?.devOtp ?? null,
    error: null,
    fieldErrors: null,
  });
}

export default function Bookings({ loaderData, actionData }: Route.ComponentProps) {
  const { recent, myBookings } = loaderData;
  const { t } = useTranslation(NsI18n.Booking);
  const locale = useLocale();
  const sent = actionData?.sent ?? false;

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">{t('lookup.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('lookup.subtitle')}</p>

      {myBookings.length > 0 ? (
        <section className="mt-6" aria-labelledby="my-bookings-title">
          <h2 id="my-bookings-title" className="mb-2 text-sm font-semibold text-foreground">
            {t('lookup.myBookingsTitle')}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {myBookings.map((booking) => (
              <li key={booking.id}>
                <Link
                  to={storefrontPaths.booking(locale, booking.code)}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted"
                >
                  <span>
                    <span className="block font-mono text-sm font-semibold">{booking.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {dateLabelInTz(booking.startUtc, DEFAULT_TZ, locale)} ·{' '}
                      {timeInTz(booking.startUtc, DEFAULT_TZ)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-primary">
                    {t(`statusLabels.${booking.status}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card className="mt-6 rounded-2xl border-border">
        <CardContent className="p-6">
          {sent ? (
            <VerifyForm code={actionData!.code} devOtp={actionData!.devOtp} locale={locale} />
          ) : (
            <RequestForm
              error={actionData?.error ?? null}
              fieldErrors={actionData?.fieldErrors ?? null}
            />
          )}
        </CardContent>
      </Card>

      <RecentList recent={recent} locale={locale} />
    </div>
  );
}

function RequestForm({
  error,
  fieldErrors,
}: {
  error: string | null;
  fieldErrors: Partial<Record<keyof BookingLookupInput, string[] | undefined>> | null;
}) {
  const { t } = useTranslation(NsI18n.Booking);

  const fields: FieldConfig<BookingLookupInput>[] = [
    {
      name: 'code',
      type: 'text',
      label: t('lookup.codeLabel'),
      placeholder: t('lookup.codePlaceholder'),
      autoComplete: 'off',
      required: true,
    },
  ];

  return (
    <GenericForm
      schema={bookingLookupInputSchema}
      fields={fields}
      defaultValues={{ code: '' }}
      submitLabel={t('lookup.sendOtp')}
      submitFullWidth
      serverError={error ? t('lookup.invalidCode') : null}
      fieldErrors={fieldErrors}
      transform={(values) => ({ code: values.code.trim().toUpperCase() })}
    />
  );
}

/** Verify via POST so the OTP never enters browser history, referrers or access logs. */
function VerifyForm({
  code,
  devOtp,
  locale,
}: {
  code: string;
  devOtp: string | null;
  locale: 'vi' | 'en';
}) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {t('lookup.otpSent')}
      </p>
      {devOtp ? (
        <p className="text-xs text-muted-foreground">{t('lookup.otpHintDev', { otp: devOtp })}</p>
      ) : null}
      <Form method="post" action={storefrontPaths.booking(locale, code)} className="space-y-3">
        <input type="hidden" name="intent" value="verify-access" />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t('lookup.otpLabel')}</span>
          <Input name="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus />
        </label>
        <Button type="submit" className="w-full">
          {t('lookup.verify')}
        </Button>
      </Form>
    </div>
  );
}

function RecentList({ recent, locale }: { recent: string[]; locale: 'vi' | 'en' }) {
  const { t } = useTranslation(NsI18n.Booking);
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
                to={storefrontPaths.booking(locale, code)}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted"
              >
                <span className="font-mono font-semibold">{code}</span>
                <span className="text-muted-foreground">{t('viewDetails')} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
