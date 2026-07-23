import { BookingDetailPanel } from '../components/booking-detail-panel';
import { PaymentHandoff } from '../../checkout/components/payment-handoff';
import type { Route } from '../../../routes/account/+types/booking-detail';

export function AccountBookingDetailPage({ loaderData, actionData }: Route.ComponentProps) {
  if (actionData && 'handoff' in actionData && actionData.handoff) {
    return <PaymentHandoff destination={actionData.handoff} />;
  }

  const locale = loaderData.locale === 'en' ? 'en' : 'vi';
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
