import { handleAvatarUploadPresignAction } from '~/features/storage/server/avatar-upload-presign-route.server';
import type { Route } from './+types/uploads.avatar.presign';

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  return handleAvatarUploadPresignAction(request);
}
