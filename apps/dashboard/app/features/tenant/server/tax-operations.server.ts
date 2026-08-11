import { data as routeData } from 'react-router';
import {
  issueTaxCertificateInputSchema,
  prepareTaxFilingInputSchema,
  recordTaxRemittanceInputSchema,
  submitTaxFilingInputSchema,
  voidTaxCertificateInputSchema,
  type Paginated,
  type PartnerResponse,
  type TaxFilingPeriodResponse,
  type TaxWithholdingCertificateResponse,
} from '@booking/contracts';
import { apiGet, apiPost, type ApiAuth } from '~/lib/api.server';
import { startOfDayUtc } from '~/lib/calendar-dates';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';

export async function loadTaxOperations(
  auth: ApiAuth,
  options: { canManage: boolean; canReadPartners: boolean },
) {
  const [filingsResult, certificatesResult, partnersResult] = await Promise.all([
    apiGet<TaxFilingPeriodResponse[]>(apiPaths.tenant.taxFilings, auth),
    apiGet<TaxWithholdingCertificateResponse[]>(apiPaths.tenant.taxCertificates, auth),
    options.canReadPartners
      ? apiGet<Paginated<PartnerResponse>>(apiPaths.tenant.partners, auth, {
          query: { pageSize: FETCH_ALL_PAGE_SIZE },
        })
      : Promise.resolve(null),
  ]);

  const errors = [
    filingsResult.ok ? null : filingsResult.error,
    certificatesResult.ok ? null : certificatesResult.error,
    partnersResult && !partnersResult.ok ? partnersResult.error : null,
  ].filter(Boolean);

  return {
    filings: filingsResult.ok ? (filingsResult.data ?? []) : [],
    certificates: certificatesResult.ok ? (certificatesResult.data ?? []) : [],
    partners: partnersResult?.ok ? (partnersResult.data?.items ?? []) : [],
    canManage: options.canManage,
    error: errors.length > 0 ? errors.join(' ') : null,
  };
}

export async function handleTaxOperationsAction(request: Request, auth: ApiAuth) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'prepare') {
    const parsed = prepareTaxFilingInputSchema.safeParse({
      taxYear: Number(form.get('taxYear')),
      taxMonth: Number(form.get('taxMonth')),
    });
    if (!parsed.success) return invalid('Chọn tháng kê khai hợp lệ.');
    return post(apiPaths.tenant.taxFilingPrepare, parsed.data, auth, 'Đã lập kỳ kê khai.');
  }

  if (intent === 'submit') {
    const filingId = String(form.get('filingId') ?? '');
    const parsed = submitTaxFilingInputSchema.safeParse({
      submissionReference: form.get('submissionReference'),
    });
    if (!filingId || !parsed.success) return invalid('Cần mã tiếp nhận hồ sơ khai thuế.');
    return post(apiPaths.tenant.taxFilingSubmit(filingId), parsed.data, auth, 'Đã ghi nhận nộp tờ khai.');
  }

  if (intent === 'remit') {
    const filingId = String(form.get('filingId') ?? '');
    const paidDate = String(form.get('paidDate') ?? '');
    const note = String(form.get('note') ?? '').trim();
    const fileKey = String(form.get('fileKey') ?? '').trim();
    const parsed = recordTaxRemittanceInputSchema.safeParse({
      vatAmount: form.get('vatAmount'),
      pitAmount: form.get('pitAmount'),
      paymentReference: form.get('paymentReference'),
      paidAt: /^\d{4}-\d{2}-\d{2}$/.test(paidDate)
        ? startOfDayUtc(paidDate)
        : '',
      evidence: note || fileKey ? { note: note || undefined, fileKey: fileKey || undefined } : undefined,
    });
    if (!filingId || !parsed.success) return invalid('Kiểm tra ngày nộp, tham chiếu và chứng từ.');
    return post(apiPaths.tenant.taxFilingRemittances(filingId), parsed.data, auth, 'Đã ghi nhận nộp thuế và tất toán nghĩa vụ.');
  }

  if (intent === 'issue-certificate') {
    const parsed = issueTaxCertificateInputSchema.safeParse({
      partnerId: form.get('partnerId'),
      taxYear: Number(form.get('taxYear')),
      certificateNumber: form.get('certificateNumber'),
      fileKey: form.get('fileKey'),
    });
    if (!parsed.success) return invalid('Kiểm tra đối tác, năm và thông tin tệp chứng từ.');
    return post(apiPaths.tenant.taxCertificates, parsed.data, auth, 'Đã phát hành chứng từ khấu trừ.');
  }

  if (intent === 'void-certificate') {
    const certificateId = String(form.get('certificateId') ?? '');
    const parsed = voidTaxCertificateInputSchema.safeParse({ reason: form.get('reason') });
    if (!certificateId || !parsed.success) {
      return invalid('Lý do huỷ phải có từ 10 đến 500 ký tự.');
    }
    return post(
      apiPaths.tenant.taxCertificateVoid(certificateId),
      parsed.data,
      auth,
      'Đã huỷ chứng từ. Có thể tải PDF mới để phát hành phiên bản thay thế.',
    );
  }

  return invalid('Thao tác thuế không hợp lệ.');
}

async function post(path: string, body: unknown, auth: ApiAuth, message: string) {
  const result = await apiPost(path, body, auth);
  if (!result.ok) {
    return routeData({ error: result.error ?? 'Không hoàn tất được thao tác thuế.' }, { status: result.status || 400 });
  }
  return { ok: true, message };
}

function invalid(error: string) {
  return routeData({ error }, { status: 400 });
}
