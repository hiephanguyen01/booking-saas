import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { BookingPaymentView } from '../features/booking/components/booking-payment-view';
import {
  handleBookingDetailAction,
  loadBookingDetail,
} from '../features/booking/server/booking-detail.server';
import { useBookingDetailController } from '../features/booking/use-booking-detail-controller';
import { PaymentHandoff } from '../features/checkout/components/payment-handoff';
import { NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import { useLocale } from '../lib/use-locale';
import type { Route } from './+types/booking-detail';

export function meta() {
  return [{ title: 'Booking' }, { name: 'robots', content: 'noindex' }];
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadBookingDetail(request, params.code);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleBookingDetailAction(request, params.code, locale);
}

export default function BookingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { handoffDestination, viewProps } = useBookingDetailController({
    loaderData,
    actionData,
  });

  if (handoffDestination) {
    return <PaymentHandoff destination={handoffDestination} />;
  }

  return <BookingPaymentView {...viewProps} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Navigation);
  return (
    <RouteErrorState
      error={error}
      homeHref={storefrontPaths.bookings(locale)}
      homeLabel={t('lookup')}
    />
  );
}
