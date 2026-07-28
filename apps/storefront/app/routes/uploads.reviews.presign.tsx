import { handleReviewMediaUploadPresignAction } from '~/features/storage/server/review-media-upload-presign-route.server';
import type { Route } from './+types/uploads.reviews.presign';

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  return handleReviewMediaUploadPresignAction(request);
}
