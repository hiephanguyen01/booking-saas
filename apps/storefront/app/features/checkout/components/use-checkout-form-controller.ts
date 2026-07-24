import type { CurrentUser, CustomerPaymentMethod } from '@booking/contracts';
import {
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
import { useNavigation } from 'react-router';
import { NsI18n, type ScopedI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { useLocale } from '../../../lib/use-locale';

export type CheckoutContactFieldModel = {
  name: 'fullName' | 'phone' | 'email' | 'customerNote';
  label: string;
  icon: LucideIcon;
  type?: string;
  autoComplete?: string;
  defaultValue: string;
  errorMessage?: string;
};

export type CheckoutPaymentMethodModel = {
  value: CustomerPaymentMethod;
  icon: LucideIcon;
  label: string;
};

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

export function useCheckoutFormController({
  listingSlug,
  currentUser,
  fieldErrors,
  serverError,
  paymentMethods,
}: {
  listingSlug: string;
  currentUser: CurrentUser | null;
  fieldErrors: Partial<Record<string, string[]>> | null;
  serverError: string | null;
  paymentMethods: CustomerPaymentMethod[];
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const navigation = useNavigation();
  const locale = useLocale();
  const packageError =
    serverError === 'PACKAGE_UNAVAILABLE' || serverError === 'PACKAGE_DURATION_MISMATCH';
  const contactFields: CheckoutContactFieldModel[] = [
    {
      name: 'fullName',
      label: t('fullName'),
      icon: UserRound,
      autoComplete: 'name',
      defaultValue: currentUser?.fullName ?? '',
      errorMessage: fieldErrors?.fullName?.length ? t('fieldErrors.fullName') : undefined,
    },
    {
      name: 'phone',
      label: t('phone'),
      icon: Phone,
      autoComplete: 'tel',
      defaultValue: currentUser?.phone ?? '',
      errorMessage: fieldErrors?.phone?.length ? t('fieldErrors.phone') : undefined,
    },
    {
      name: 'email',
      label: t('email'),
      icon: Mail,
      type: 'email',
      autoComplete: 'email',
      defaultValue: currentUser?.email ?? '',
      errorMessage: fieldErrors?.email?.length ? t('fieldErrors.email') : undefined,
    },
    {
      name: 'customerNote',
      label: t('notePlaceholder'),
      icon: PencilLine,
      defaultValue: '',
    },
  ];
  const paymentMethodOptions = paymentMethods.map((method): CheckoutPaymentMethodModel => {
    const option = PAYMENT_METHODS[method];
    return { value: method, icon: option.icon, label: t(option.label) };
  });

  return {
    contactFields,
    defaultPaymentMethod: paymentMethods[0],
    packageRetryHref: packageError ? storefrontPaths.listing(locale, listingSlug) : null,
    paymentMethodOptions,
    serverErrorMessage: serverError ? checkoutError(serverError, t) : null,
    submitting: navigation.state === 'submitting',
  };
}

function checkoutError(error: string, t: ScopedI18n<NsI18n.Checkout>['t']): string {
  if (error === 'PACKAGE_UNAVAILABLE' || error === 'PACKAGE_DURATION_MISMATCH') {
    return t('packageUnavailable');
  }
  return error === 'SLOT_TAKEN' || error === 'SLOT_HELD' ? t('invalidSlot') : error;
}
