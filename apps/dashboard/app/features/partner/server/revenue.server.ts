import { data as routeData } from 'react-router';
import {
  partnerTaxWithholdingCertificateResponseSchema,
  respondSettlementDisputeInputSchema,
} from '@booking/contracts';
import type {
  LedgerEntryResponse,
  Paginated,
  PartnerFinanceResponse,
  PartnerSettlementDisputeResponse,
  PayoutResponse,
  SettlementSummaryResponse,
  PartnerTaxWithholdingCertificateResponse,
} from '@booking/contracts';
import { apiGet, apiPost } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { requirePartner } from '~/features/partner/server/partner.server';
import { readListParams } from '~/lib/pagination';

/**
 * Read and write paths for the partner revenue screen: balance, ledger, payouts
 * and settlement disputes on the way in, a dispute response on the way out.
 * Lifted out of the route module, which was 435 lines with the UI at the bottom.
 */

export async function loadPartnerRevenue(request: Request, url: URL) {
  const { auth, can } = await requirePartner(request, 'partner.finance.read');
  // Two paginated tables on one page → namespace the ledger pager so it never
  // collides with the payout pager. apiPaths.partner.finance stays balance + a recent
  // ledger preview; the full journal comes from the paginated ledger endpoint.
  const ledgerParams = readListParams(url.searchParams, {
    pageKey: 'ledgerPage',
    pageSizeKey: 'ledgerPageSize',
  });
  const payoutParams = readListParams(url.searchParams);
  const disputeParams = readListParams(url.searchParams, {
    pageKey: 'disputePage',
    pageSizeKey: 'disputePageSize',
  });
  const [financeRes, ledgerRes, payoutsRes, settlementSummaryRes, disputesRes, certificatesRes] =
    await Promise.all([
      apiGet<PartnerFinanceResponse>(apiPaths.partner.finance, auth),
      apiGet<Paginated<LedgerEntryResponse>>(apiPaths.partner.ledger, auth, {
        query: ledgerParams.toApiQuery(),
      }),
      apiGet<Paginated<PayoutResponse>>(apiPaths.partner.payouts, auth, {
        query: payoutParams.toApiQuery(),
      }),
      apiGet<SettlementSummaryResponse>(apiPaths.partner.settlementSummary, auth),
      apiGet<Paginated<PartnerSettlementDisputeResponse>>(apiPaths.partner.financeDisputes, auth, {
        query: disputeParams.toApiQuery(),
      }),
      apiGet<PartnerTaxWithholdingCertificateResponse[]>(apiPaths.partner.taxCertificates, auth, {
        schema: partnerTaxWithholdingCertificateResponseSchema.array(),
      }),
    ]);
  const finance: PartnerFinanceResponse =
    financeRes.ok && financeRes.data ? financeRes.data : { balance: '0', entries: [] };
  return {
    finance,
    ledger: ledgerRes.ok && ledgerRes.data ? ledgerRes.data.items : [],
    ledgerTotal: ledgerRes.ok && ledgerRes.data ? ledgerRes.data.total : 0,
    payouts: payoutsRes.ok && payoutsRes.data ? payoutsRes.data.items : [],
    payoutsTotal: payoutsRes.ok && payoutsRes.data ? payoutsRes.data.total : 0,
    settlementSummary:
      settlementSummaryRes.ok && settlementSummaryRes.data ? settlementSummaryRes.data : null,
    disputes: disputesRes.ok && disputesRes.data ? disputesRes.data.items : [],
    disputesTotal: disputesRes.ok && disputesRes.data ? disputesRes.data.total : 0,
    certificates: certificatesRes.ok && certificatesRes.data ? certificatesRes.data : [],
    canRespondToDisputes: can('partner.disputes.respond'),
    financeError: financeRes.ok ? null : (financeRes.error ?? 'Không tải được dữ liệu tài chính.'),
    ledgerError: ledgerRes.ok ? null : (ledgerRes.error ?? 'Không tải được sổ cái.'),
    payoutsError: payoutsRes.ok ? null : (payoutsRes.error ?? 'Không tải được lịch sử chi trả.'),
    settlementsError: settlementSummaryRes.ok
      ? null
      : (settlementSummaryRes.error ?? 'Không tải được trạng thái đối soát.'),
    disputesError: disputesRes.ok
      ? null
      : (disputesRes.error ?? 'Không tải được tranh chấp liên quan.'),
    certificatesError: certificatesRes.ok
      ? null
      : (certificatesRes.error ?? 'Không tải được chứng từ khấu trừ.'),
  };
}

export async function respondToSettlementDispute(request: Request) {
  const { auth } = await requirePartner(request, 'partner.disputes.respond');
  const form = await request.formData();
  const disputeId = String(form.get('disputeId') ?? '');
  const parsed = respondSettlementDisputeInputSchema.safeParse({ response: form.get('response') });
  if (!parsed.success) {
    return routeData({ error: 'Phản hồi phải có ít nhất 10 ký tự.' }, { status: 400 });
  }
  const result = await apiPost<PartnerSettlementDisputeResponse>(
    `/partner/finance/disputes/${encodeURIComponent(disputeId)}/respond`,
    parsed.data,
    auth,
  );
  if (!result.ok) {
    return routeData({ error: result.error ?? 'Không gửi được phản hồi.' }, { status: 400 });
  }
  return { ok: true };
}
