import { bookingLookupInputSchema, type BookingLookupInput } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Search, ShieldCheck } from 'lucide-react';
import { BookingAccessVerifyForm } from '~/features/booking/components/booking-access-verify-form';
import type { actionBookingsRoute } from '~/features/booking/server/bookings-route.server';
import { useLocale } from '~/hooks/use-locale';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { SectionCard } from '~/components/section-card';

export function BookingsLookupPage({
  actionData,
}: {
  actionData?: ServerDataFrom<typeof actionBookingsRoute>;
}) {
  const { t } = useTranslation(NsI18n.Booking);
  const locale = useLocale();
  const sent = actionData?.sent ?? false;

  return (
    <div className="min-h-full bg-muted/50 py-6 font-studio sm:py-10 lg:py-14">
      <main className="mx-auto w-full max-w-2xl px-4 sm:px-6">
        <SectionCard aria-labelledby="lookup-form-title" className="relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />

          <div className="flex items-start justify-between gap-4 pt-1">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Search className="size-5" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1
                  id="lookup-form-title"
                  className="text-2xl leading-tight font-semibold tracking-tight text-foreground"
                >
                  {t('lookup.title')}
                </h1>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground text-pretty">
                  {t('lookup.subtitle')}
                </p>
              </div>
            </div>
            <span className="hidden rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold tracking-wide text-primary sm:block">
              OTP
            </span>
          </div>

          <div className="mt-6">
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

          <p className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{t('lookup.privacyNote')}</span>
          </p>
        </SectionCard>
      </main>
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
      className="[&_button]:font-semibold [&_input]:bg-muted/25 [&_input]:font-mono [&_input]:uppercase [&_input]:tracking-wide"
    />
  );
}
