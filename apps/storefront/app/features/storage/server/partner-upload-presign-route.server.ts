import {
  partnerDocumentUploadInputSchema,
  privateDocumentUploadResponseSchema,
  type PrivateDocumentUploadResponse,
} from '@booking/contracts';
import { apiPaths } from '~/constants/api-paths';
import { storefrontPaths } from '~/constants/paths';
import { requirePartnerPhase } from '~/features/partner-onboarding/server/partner-onboarding-shared.server';
import { allowedStorageUploadUrl } from '~/features/storage/server/upload-origin.server';
import { apiFailureStatus, apiPost } from '~/lib/server/api.server';
import { requireAuth } from '~/lib/server/auth.server';
import { resolveLocale } from '~/lib/server/i18n.server';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { requestBodyFailureStatus } from '~/lib/server/request-body.server';
import { getCurrentStorefrontTenant } from '~/lib/server/request-context.server';
import { MAX_PRESIGN_REQUEST_BYTES, uploadRouteJson } from './upload-route-response.server';

/**
 * Authenticated partner-onboarding document upload proxy. The browser never sees
 * the backend access token; it receives only a short-lived private-bucket PUT
 * grant and persists the opaque object key returned after upload.
 */
export async function handlePartnerUploadPresignAction(request: Request): Promise<Response> {
  const tenant = getCurrentStorefrontTenant();
  const locale = resolveLocale(request, tenant.defaultLocale);
  await requirePartnerPhase(request, 'partner_registration_profile', locale);
  const auth = requireAuth(storefrontPaths.becomePartner(locale));

  const body = await readJsonRequestBody(request, MAX_PRESIGN_REQUEST_BYTES);
  if (!body.ok) {
    return uploadRouteJson(
      {
        code: body.code,
        message:
          body.code === 'PAYLOAD_TOO_LARGE'
            ? 'Yêu cầu tải lên vượt quá kích thước cho phép.'
            : 'Yêu cầu tải lên không hợp lệ.',
      },
      requestBodyFailureStatus(body.code),
    );
  }

  const parsed = partnerDocumentUploadInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return uploadRouteJson(
      { code: 'INVALID_UPLOAD_REQUEST', message: 'Yêu cầu tải lên không hợp lệ.' },
      400,
    );
  }

  const result = await apiPost<PrivateDocumentUploadResponse>(
    request,
    apiPaths.partner.applicationDocumentPresign,
    parsed.data,
    auth.session.accessToken,
    { schema: privateDocumentUploadResponseSchema, timeoutMs: 10_000 },
  );
  if (!result.ok || !result.data) {
    const status = apiFailureStatus(result);
    const code =
      status === 504
        ? 'UPLOAD_SERVICE_TIMEOUT'
        : status === 503
          ? 'UPLOAD_SERVICE_UNAVAILABLE'
          : 'UPLOAD_PRESIGN_FAILED';
    const message =
      status === 504
        ? 'Dịch vụ tải lên phản hồi quá thời gian cho phép.'
        : status === 503
          ? 'Dịch vụ tải lên hiện không khả dụng.'
          : 'Không thể tạo liên kết tải lên.';
    return uploadRouteJson({ code, message }, status);
  }

  const uploadUrl = allowedStorageUploadUrl(result.data.uploadUrl);
  if (!uploadUrl) {
    return uploadRouteJson(
      {
        code: 'UNAPPROVED_UPLOAD_ORIGIN',
        message: 'Dịch vụ tải lên trả về máy chủ lưu trữ chưa được cho phép.',
      },
      502,
    );
  }

  return uploadRouteJson({ ...result.data, uploadUrl }, 200);
}
