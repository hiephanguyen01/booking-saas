import { AccountReviewsPage } from '~/features/account/reviews/reviews-page';
import {
  handleAccountReviewsAction,
  loadAccountReviewsRoute,
} from '~/features/account/reviews/server/reviews-route.server';
import type { Route } from './+types/reviews';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadAccountReviewsRoute(request, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleAccountReviewsAction(request, locale);
}

export default function ReviewsRoute(props: Route.ComponentProps) {
  return <AccountReviewsPage {...props} />;
}
