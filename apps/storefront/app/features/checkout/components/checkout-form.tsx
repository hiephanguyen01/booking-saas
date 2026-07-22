import type { CurrentUser, CustomerPaymentMethod } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@booking/ui/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { cn } from '@booking/ui/lib/utils';
import {
  CircleAlert,
  CreditCard,
  Landmark,
  Mail,
  PencilLine,
  Phone,
  QrCode,
  Smartphone,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Form, Link, useNavigation } from 'react-router';
import { SectionCard } from '../../../components/section-card';
import { NsI18n, type ScopedI18n, useTranslation } from '../../../lib/i18n';
import { formatVnd } from '../../../lib/ui';
import { storefrontPaths } from '../../../lib/locale-paths';
import { useLocale } from '../../../lib/use-locale';

export function CheckoutForm({
  listingId,
  listingSlug,
  mode,
  start,
  end,
  qty,
  packageId,
  promoCode,
  currentUser,
  fieldErrors,
  serverError,
  dueNow,
  expectedSubtotal,
  paymentMethods,
}: {
  listingId: string;
  listingSlug: string;
  mode: string;
  start: string;
  end: string;
  qty: string;
  packageId: string | null;
  promoCode: string | null;
  currentUser: CurrentUser | null;
  fieldErrors: Partial<Record<string, string[]>> | null;
  serverError: string | null;
  dueNow: string;
  expectedSubtotal: string;
  paymentMethods: CustomerPaymentMethod[];
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const navigation = useNavigation();
  const locale = useLocale();
  const submitting = navigation.state === 'submitting';

  return (
    <Form method="post" className="flex flex-col gap-4">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="listingSlug" value={listingSlug} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />
      <input type="hidden" name="qty" value={qty} />
      {packageId ? <input type="hidden" name="packageId" value={packageId} /> : null}
      <input type="hidden" name="expectedSubtotal" value={expectedSubtotal} />
      {promoCode ? <input type="hidden" name="promoCode" value={promoCode} /> : null}

      <SectionCard aria-labelledby="checkout-contact-heading">
        <h2
          id="checkout-contact-heading"
          className="text-base leading-6 font-semibold text-foreground"
        >
          {t('guestSection')}
        </h2>
        {serverError ? (
          <Alert variant="destructive" className="mt-4 rounded-sm">
            <AlertDescription>
              {checkoutError(serverError, t)}{' '}
              {serverError === 'PACKAGE_UNAVAILABLE' ||
              serverError === 'PACKAGE_DURATION_MISMATCH' ? (
                <Link
                  className="font-medium underline"
                  to={storefrontPaths.listing(locale, listingSlug)}
                >
                  {t('selectPackageAgain')}
                </Link>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup className="mt-4 gap-4">
          <ContactField
            name="fullName"
            label={t('fullName')}
            icon={UserRound}
            autoComplete="name"
            defaultValue={currentUser?.fullName ?? ''}
            errors={fieldErrors?.fullName}
          />
          <ContactField
            name="phone"
            label={t('phone')}
            icon={Phone}
            autoComplete="tel"
            defaultValue={currentUser?.phone ?? ''}
            errors={fieldErrors?.phone}
          />
          <ContactField
            name="email"
            type="email"
            label={t('email')}
            icon={Mail}
            autoComplete="email"
            defaultValue={currentUser?.email ?? ''}
            errors={fieldErrors?.email}
          />
          <ContactField
            name="customerNote"
            label={t('notePlaceholder')}
            icon={PencilLine}
            defaultValue=""
          />
        </FieldGroup>
      </SectionCard>

      <SectionCard aria-labelledby="checkout-payment-heading">
        <h2
          id="checkout-payment-heading"
          className="text-base leading-6 font-semibold text-foreground"
        >
          {t('payment.title')}
        </h2>
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-sm leading-5 font-medium text-foreground">{t('deposit')}</span>
          <strong className="text-base leading-6 font-semibold text-primary">
            {formatVnd(dueNow)}
          </strong>
        </div>
        <PaymentMethods methods={paymentMethods} />
      </SectionCard>

      <Button
        type="submit"
        size="control"
        className="w-full text-base font-semibold lg:ml-auto lg:w-70"
        disabled={submitting}
      >
        {submitting ? <Spinner data-icon="inline-start" /> : null}
        {submitting ? t('creating') : t('payNow')}
      </Button>
    </Form>
  );
}

const PAYMENT_METHODS: Record<
  CustomerPaymentMethod,
  {
    icon: LucideIcon;
    label:
      | 'payment.transfer'
      | 'payment.domesticCard'
      | 'payment.internationalCard'
      | 'payment.momoWallet'
      | 'payment.zaloWallet';
  }
> = {
  bank_transfer: { icon: Landmark, label: 'payment.transfer' },
  napas_qr: { icon: QrCode, label: 'payment.domesticCard' },
  international_card: { icon: CreditCard, label: 'payment.internationalCard' },
  momo_wallet: { icon: Wallet, label: 'payment.momoWallet' },
  zalopay_wallet: { icon: Smartphone, label: 'payment.zaloWallet' },
};

function PaymentMethods({ methods }: { methods: CustomerPaymentMethod[] }) {
  const { t } = useTranslation(NsI18n.Checkout);
  return (
    <fieldset className="mt-4">
      <legend className="text-sm leading-5 font-medium text-foreground">
        {t('payment.method')}
      </legend>
      <RadioGroup
        name="paymentMethod"
        defaultValue={methods[0]}
        className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"
        aria-label={t('payment.method')}
      >
        {methods.map((method) => {
          const option = PAYMENT_METHODS[method];
          return (
            <PaymentMethod key={method} value={method} icon={option.icon} label={t(option.label)} />
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

function PaymentMethod({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: LucideIcon;
  label: string;
}) {
  const id = `payment-${value}`;
  return (
    <FieldLabel
      htmlFor={id}
      className={cn(
        // `w-full` overrides FieldLabel's base `w-fit`, which would shrink the tile in its grid cell.
        'relative flex h-17 w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-border bg-card p-2 text-center',
        'has-data-[state=checked]:border-primary has-data-[state=checked]:bg-card',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
      )}
    >
      <RadioGroupItem id={id} value={value} className="sr-only" />
      <Icon className="size-6 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
      <span className="text-[11px] leading-4 font-medium text-foreground sm:text-xs">{label}</span>
    </FieldLabel>
  );
}

const FIELD_ERROR_KEYS = {
  fullName: 'fieldErrors.fullName',
  phone: 'fieldErrors.phone',
  email: 'fieldErrors.email',
} as const;

function ContactField({
  name,
  label,
  icon: Icon,
  type = 'text',
  autoComplete,
  defaultValue,
  errors,
}: {
  name: string;
  label: string;
  icon: LucideIcon;
  type?: string;
  autoComplete?: string;
  defaultValue: string;
  errors?: string[];
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const invalid = Boolean(errors?.length);
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={name} className="sr-only">
        {label}
      </FieldLabel>
      <InputGroup>
        <InputGroupAddon className={cn(invalid && 'text-destructive')}>
          <Icon strokeWidth={1.6} aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id={name}
          name={name}
          type={type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          placeholder={label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${name}-error` : undefined}
        />
        {invalid ? (
          <InputGroupAddon align="inline-end" className="text-destructive">
            <CircleAlert aria-hidden="true" />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <FieldError id={`${name}-error`} className="mt-1 text-xs leading-4">
        {invalid
          ? t(FIELD_ERROR_KEYS[name as keyof typeof FIELD_ERROR_KEYS] ?? 'fieldErrors.generic')
          : null}
      </FieldError>
    </Field>
  );
}

function checkoutError(error: string, t: ScopedI18n<NsI18n.Checkout>['t']): string {
  if (error === 'PACKAGE_UNAVAILABLE' || error === 'PACKAGE_DURATION_MISMATCH') {
    return t('packageUnavailable');
  }
  return error === 'SLOT_TAKEN' || error === 'SLOT_HELD' ? t('invalidSlot') : error;
}
