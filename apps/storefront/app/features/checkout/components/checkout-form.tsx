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
import { CircleAlert, type LucideIcon } from 'lucide-react';
import { Form, Link } from 'react-router';
import { SectionCard } from '../../../components/section-card';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { formatVnd } from '../../../lib/ui';
import {
  useCheckoutFormController,
  type CheckoutContactFieldModel,
  type CheckoutPaymentMethodModel,
} from './use-checkout-form-controller';

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
  checkoutAttemptId,
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
  checkoutAttemptId: string;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const {
    contactFields,
    defaultPaymentMethod,
    handleSubmit,
    packageRetryHref,
    paymentMethodOptions,
    serverErrorMessage,
    submitting,
  } = useCheckoutFormController({
    listingSlug,
    currentUser,
    fieldErrors,
    serverError,
    paymentMethods,
  });

  return (
    <Form method="post" className="flex flex-col gap-4" onSubmit={handleSubmit} aria-busy={submitting}>
      <input type="hidden" name="intent" value="checkout" />
      <input type="hidden" name="checkoutAttemptId" value={checkoutAttemptId} />
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
        {serverErrorMessage ? (
          <Alert variant="destructive" className="mt-4 rounded-sm">
            <AlertDescription>
              {serverErrorMessage}{' '}
              {packageRetryHref ? (
                <Link className="font-medium underline" to={packageRetryHref}>
                  {t('selectPackageAgain')}
                </Link>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup className="mt-4 gap-4">
          {contactFields.map((field) => (
            <ContactField key={field.name} {...field} disabled={submitting} />
          ))}
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
        <PaymentMethods
          options={paymentMethodOptions}
          defaultValue={defaultPaymentMethod}
          disabled={submitting}
        />
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

function PaymentMethods({
  options,
  defaultValue,
  disabled,
}: {
  options: CheckoutPaymentMethodModel[];
  defaultValue?: CustomerPaymentMethod;
  disabled: boolean;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="text-sm leading-5 font-medium text-foreground">
        {t('payment.method')}
      </legend>
      <RadioGroup
        name="paymentMethod"
        defaultValue={defaultValue}
        className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"
        aria-label={t('payment.method')}
        disabled={disabled}
      >
        {options.map((option) => (
          <PaymentMethod key={option.value} {...option} />
        ))}
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

function ContactField({
  name,
  label,
  icon: Icon,
  type = 'text',
  autoComplete,
  defaultValue,
  errorMessage,
  disabled,
}: CheckoutContactFieldModel & { disabled: boolean }) {
  const invalid = Boolean(errorMessage);
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
          disabled={disabled}
        />
        {invalid ? (
          <InputGroupAddon align="inline-end" className="text-destructive">
            <CircleAlert aria-hidden="true" />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <FieldError id={`${name}-error`} className="mt-1 text-xs leading-4">
        {errorMessage}
      </FieldError>
    </Field>
  );
}
