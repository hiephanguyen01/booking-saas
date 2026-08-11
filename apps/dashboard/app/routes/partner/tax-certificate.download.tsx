import { taxDocumentDownloadResponseSchema } from '@booking/contracts';
import { redirect } from 'react-router';
import type { Route } from './+types/tax-certificate.download';
import { apiPaths } from '~/constants/api-paths';
import { requirePartner } from '~/features/partner/server/partner.server';
import { apiGet, unwrapApiResult } from '~/lib/api.server';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.finance.read');
  const result = await apiGet(apiPaths.partner.taxCertificateDownload(params.certificateId), auth, {
    signal: request.signal,
    schema: taxDocumentDownloadResponseSchema,
  });
  const grant = unwrapApiResult(result, 'Không thể mở chứng từ khấu trừ.');
  return redirect(grant.downloadUrl);
}
