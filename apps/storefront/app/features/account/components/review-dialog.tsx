import type { CustomerReviewItem } from '@booking/contracts';
import { ReviewDialogView } from './review-dialog-view';
import { useReviewDialogController } from './use-review-dialog-controller';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function ReviewDialog({
  review,
  open,
  action,
  onOpenChange,
}: {
  review: PendingReview | null;
  open: boolean;
  action?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useReviewDialogController({ review, open, action, onOpenChange });

  return <ReviewDialogView open={open} reviewTitle={review?.listingTitle ?? ''} {...controller} />;
}
