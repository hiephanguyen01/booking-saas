import { localeParam } from '~/constants/paths';
import { BookingDetailPanel } from '~/features/account/components/booking-detail/booking-detail-panel';
import type {
  handleAccountBookingDetailAction,
  loadAccountBookingDetailRoute,
} from '~/features/account/server/account-booking-detail-route.server';
import { PaymentHandoff } from '~/features/checkout/components/payment-handoff';
import type { ServerDataFrom } from '~/lib/react-router-data';

export interface AccountBookingDetailPageProps {
  loaderData: ServerDataFrom<typeof loadAccountBookingDetailRoute>;
  actionData?: ServerDataFrom<typeof handleAccountBookingDetailAction>;
}

export function AccountBookingDetailPage({
  loaderData,
  actionData,
}: AccountBookingDetailPageProps) {
  if (actionData && 'handoff' in actionData && actionData.handoff) {
    return <PaymentHandoff destination={actionData.handoff} />;
  }

  const locale = localeParam(loaderData.locale);
  return (
    <BookingDetailPanel
      booking={loaderData.booking}
      locale={locale}
      defaultCancelOpen={loaderData.defaultCancelOpen}
      actionError={actionData && !actionData.ok ? actionData.error : null}
      settlement={loaderData.settlement}
    />
  );
}
