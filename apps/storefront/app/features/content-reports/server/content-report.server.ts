import {
  createContentReportInputSchema,
  createContentReportResponseSchema,
  type ContentReportTarget,
} from '@booking/contracts';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { data } from 'react-router';
import { apiPost } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import { errorStatus } from '~/lib/http-status';

export async function submitContentReport(
  request: Request,
  target: ContentReportTarget,
  targetId: string,
) {
  const auth = getOptionalAuth();
  if (!auth) return data({ reportOk: false as const, error: 'unauthorized' }, { status: 401 });
  const body = await readJsonRequestBody(request);
  const payload = body.ok && body.value && typeof body.value === 'object' ? body.value : {};
  const parsed = createContentReportInputSchema.safeParse({
    ...payload,
    target,
    targetId,
  });
  if (!parsed.success) {
    return data(
      {
        reportOk: false as const,
        error: 'invalid',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const result = await apiPost(
    request,
    '/customer/content-reports',
    parsed.data,
    auth.session.accessToken,
    {
      schema: createContentReportResponseSchema,
    },
  );
  if (!result.ok || !result.data) {
    return data(
      { reportOk: false as const, error: 'failed' },
      { status: errorStatus(result.status) },
    );
  }
  return data({ reportOk: true as const, duplicate: result.data.duplicate });
}
