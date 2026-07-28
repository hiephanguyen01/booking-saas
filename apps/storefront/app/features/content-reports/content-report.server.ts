import {
  createContentReportInputSchema,
  createContentReportResponseSchema,
  type ContentReportTarget,
} from '@booking/contracts';
import { data } from 'react-router';
import { apiPost } from '~/lib/api.server';
import { getOptionalAuth } from '~/lib/auth.server';
import { errorStatus } from '~/lib/http-status';

export async function submitContentReport(
  request: Request,
  target: ContentReportTarget,
  targetId: string,
) {
  const auth = getOptionalAuth();
  if (!auth) return data({ reportOk: false as const, error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = createContentReportInputSchema.safeParse({
    ...(body && typeof body === 'object' ? body : {}),
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
