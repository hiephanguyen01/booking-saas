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
    <div className="bg-muted/20 font-studio">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('lookup.title')}
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{t('lookup.subtitle')}</p>
        </header>

      {myBookings.length > 0 ? (
        <section
          className="mt-8 rounded-sm border border-border bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="my-bookings-title"
        >
          <div>
            <h2 id="my-bookings-title" className="font-semibold text-foreground">
              {t('lookup.myBookingsTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('lookup.myBookingsDescription')}
            </p>
          </div>
          <ul className="mt-5 divide-y divide-border overflow-hidden rounded-sm border border-border">
            {myBookings.map((booking) => (
              <li key={booking.id}>
                <Link
                  to={storefrontPaths.booking(locale, booking.code)}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span>
                    <span className="block font-mono text-sm font-semibold">{booking.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {dateLabelInTz(booking.startUtc, DEFAULT_TZ, locale)},{' '}
                      {timeInTz(booking.startUtc, DEFAULT_TZ)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-sm bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {t(`statusLabels.${booking.status}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card className="mt-6 gap-0 rounded-sm border-border py-0 shadow-sm sm:mt-8">
        <CardContent className="p-5 sm:p-8">
          <div className="mb-7">
            <h2 className="text-lg font-semibold text-foreground">{t('lookup.formTitle')}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('lookup.formDescription')}
            </p>
          </div>
          {sent ? (
            <VerifyForm code={actionData!.code} devOtp={actionData!.devOtp} locale={locale} />
          ) : (
            <RequestForm
              error={actionData?.error ?? null}
              fieldErrors={actionData?.fieldErrors ?? null}
            />
          )}
        </CardContent>
        <div className="border-t border-border bg-muted/30 px-5 py-4 text-sm leading-6 text-muted-foreground sm:px-8">
          {t('lookup.privacyNote')}
        </div>
      </Card>

      <RecentList recent={recent} locale={locale} />
      </div>
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
      submitPendingLabel={t('lookup.sendingOtp')}
      submitFullWidth
      serverError={error ? t('lookup.invalidCode') : null}
      fieldErrors={fieldErrors}
      transform={(values) => ({ code: values.code.trim().toUpperCase() })}
      className="[&_button[type=submit]]:h-12 [&_button[type=submit]]:rounded-sm [&_input]:h-12 [&_input]:rounded-sm [&_input]:font-mono [&_input]:uppercase [&_input]:tracking-wide"
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
    <div className="space-y-5">
      <p className="rounded-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground">
        {t('lookup.otpSent')}
      </p>
      {devOtp ? (
        <p className="rounded-sm bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
          {t('lookup.otpHintDev', { otp: devOtp })}
        </p>
      ) : null}
      <Form method="post" action={storefrontPaths.booking(locale, code)} className="space-y-5">
        <input type="hidden" name="intent" value="verify-access" />
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t('lookup.otpLabel')}</span>
          <Input
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className="h-12 rounded-sm font-mono tracking-[0.2em]"
          />
        </label>
        <Button type="submit" className="h-12 w-full rounded-sm">
          {t('lookup.verify')}
        </Button>
      </Form>
    </div>
  );
}

function RecentList({ recent, locale }: { recent: string[]; locale: 'vi' | 'en' }) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <section className="mt-6 rounded-sm border border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="font-semibold text-foreground">{t('lookup.recentTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('lookup.recentDescription')}</p>
      {recent.length === 0 ? (
        <p className="mt-5 rounded-sm border border-dashed border-border bg-muted/25 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('lookup.recentEmpty')}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-sm border border-border">
          {recent.map((code) => (
            <li key={code}>
              <Link
                to={storefrontPaths.booking(locale, code)}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="font-mono font-semibold">{code}</span>
                <span className="text-muted-foreground">{t('viewDetails')} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
