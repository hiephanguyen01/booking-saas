import { handlePartnerUploadPresignAction } from '~/features/storage/server/partner-upload-presign-route.server';
import type { Route } from './+types/uploads.presign';

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  return handlePartnerUploadPresignAction(request);
}
