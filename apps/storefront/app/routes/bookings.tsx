import { BookingsLookupPage } from '~/features/booking/components/bookings-lookup-page';
import { buildBookingsMeta } from '~/features/booking/lib/bookings-meta';
import {
  actionBookingsRoute,
  loadBookingsRoute,
} from '~/features/booking/server/bookings-route.server';
import type { Route } from './+types/bookings';

export function meta({ params }: Route.MetaArgs) {
  return buildBookingsMeta(params.locale === 'en' ? 'en' : 'vi');
}

export async function loader(args: Route.LoaderArgs) {
  return loadBookingsRoute(args);
}

export async function action(args: Route.ActionArgs) {
  return actionBookingsRoute(args);
}

export default function BookingsRoute(props: Route.ComponentProps) {
  return <BookingsLookupPage loaderData={props.loaderData} actionData={props.actionData} />;
}
