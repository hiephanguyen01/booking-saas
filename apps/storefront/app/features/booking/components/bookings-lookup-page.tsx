import { bookingLookupInputSchema, type BookingLookupInput } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Link } from 'react-router';
import { BookingAccessVerifyForm } from '~/features/booking/components/booking-access-verify-form';
import type {
  actionBookingsRoute,
  loadBookingsRoute,
} from '~/features/booking/server/bookings-route.server';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { dateLabelInTz, timeInTz } from '~/lib/time';
import { SectionCard } from '~/components/section-card';
import { BookingStatusBadge } from '~/features/account/components/shared/booking-status-badge';

export function BookingsLookupPage({
  loaderData,
  actionData,
}: {
  loaderData: ServerDataFrom<typeof loadBookingsRoute>;
  actionData?: ServerDataFrom<typeof actionBookingsRoute>;
}) {
  const { recent, myBookings } = loaderData;
  const { t } = useTranslation(NsI18n.Booking);
  const locale = useLocale();
  const sent = actionData?.sent ?? false;

  return (
    <div className="bg-muted py-4 font-studio sm:py-6 lg:py-8">
      <div className="mx-auto w-full max-w-304.5 px-4 sm:px-6">
        {/* Unlike checkout and the outcome screens, this page is an entry point
            reached from the header rather than a step inside a flow, so it keeps
            a visible title. */}
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('lookup.title')}
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{t('lookup.subtitle')}</p>
        </header>

        {/* Two columns only when there is a list to fill the second one. A signed
            -out visitor sees the access form alone, and a lone form stretched to
            1218px reads as a mistake. */}
        <div
          className={
            myBookings.length > 0
              ? 'mt-6 grid items-start gap-4 lg:grid-cols-2 *:min-w-0'
              : 'mt-6 grid max-w-2xl items-start gap-4 *:min-w-0'
          }
        >
        {myBookings.length > 0 ? (
          <SectionCard aria-labelledby="my-bookings-title">
            <h2
              id="my-bookings-title"
              className="text-base leading-6 font-semibold text-foreground"
            >
              {t('lookup.myBookingsTitle')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('lookup.myBookingsDescription')}
            </p>
            {/* Divided rows, not a bordered box inside the card — the card is
                already the box. Rows are inset with a negative margin so the
                hover fill still reaches the card's padding edge. */}
            <ul className="-mx-(--sf-surface-pad) mt-4 divide-y divide-border border-t border-border">
              {myBookings.map((booking) => (
                <li key={booking.id}>
                  <Link
                    to={storefrontPaths.booking(locale, booking.code)}
                    className="flex min-h-16 items-center justify-between gap-4 px-(--sf-surface-pad) py-3 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span>
                      <span className="block font-mono text-sm font-semibold">{booking.code}</span>
                      <span className="text-xs text-muted-foreground">
                        {dateLabelInTz(booking.startUtc, booking.resourceTimezone, locale)},{' '}
                        {timeInTz(booking.startUtc, booking.resourceTimezone)}
                      </span>
                    </span>
                    {/* Was a hand-rolled `bg-primary/10 text-primary` pill, which
                        painted "Đã huỷ" and "Hoàn tất" the same brand red. */}
                    <BookingStatusBadge status={booking.status} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

          {/* The access form and the recent list stack in one column, the way
              checkout stacks its contact and payment cards. */}
          <div className="flex flex-col gap-4">
            {/* `SectionCard`, not a `Card` with its own gap and padding stripped
                off and rebuilt: this panel now inherits the tenant's radius,
                border, shadow and padding like every other surface. */}
            <SectionCard aria-labelledby="lookup-form-title">
              <h2
                id="lookup-form-title"
                className="text-base leading-6 font-semibold text-foreground"
              >
                {t('lookup.formTitle')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('lookup.formDescription')}
              </p>
              <div className="mt-4">
                {sent ? (
                  <BookingAccessVerifyForm
                    code={actionData!.code}
                    devOtp={actionData!.devOtp}
                    locale={locale}
                  />
                ) : (
                  <RequestForm
                    error={actionData?.error ?? null}
                    fieldErrors={actionData?.fieldErrors ?? null}
                  />
                )}
              </div>
              <p className="mt-4 rounded-lg bg-muted/40 px-5 py-4 text-sm leading-6 text-muted-foreground">
                {t('lookup.privacyNote')}
              </p>
            </SectionCard>

            <RecentList recent={recent} locale={locale} />
          </div>
        </div>
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
      // Only the typographic treatment a booking code needs. The height and
      // radius overrides that used to sit here re-implemented the control
      // geometry `@booking/ui` already owns, and pinned the radius so the
      // tenant's setting could not reach this form.
      className="[&_input]:font-mono [&_input]:uppercase [&_input]:tracking-wide"
    />
  );
}

function RecentList({ recent, locale }: { recent: string[]; locale: 'vi' | 'en' }) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <SectionCard aria-labelledby="lookup-recent-title">
      <h2 id="lookup-recent-title" className="text-base leading-6 font-semibold text-foreground">
        {t('lookup.recentTitle')}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('lookup.recentDescription')}</p>
      {recent.length === 0 ? (
        <p className="mt-4 rounded-(--sf-surface-radius) border border-dashed border-border bg-muted/25 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('lookup.recentEmpty')}
        </p>
      ) : (
        <ul className="-mx-(--sf-surface-pad) mt-4 divide-y divide-border border-t border-border">
          {recent.map((code) => (
            <li key={code}>
              <Link
                to={storefrontPaths.booking(locale, code)}
                className="flex min-h-14 items-center justify-between gap-4 px-(--sf-surface-pad) py-3 text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="font-mono font-semibold">{code}</span>
                <span className="text-muted-foreground">{t('viewDetails')} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
