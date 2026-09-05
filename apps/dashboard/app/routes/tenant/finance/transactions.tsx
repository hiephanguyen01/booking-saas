import {
  approveManualRefundInputSchema,
  claimManualRefundInputSchema,
  confirmManualRefundInputSchema,
  manualRefundDetailResponseSchema,
  manualRefundListResponseSchema,
  manualRefundOperationStatusSchema,
  manualRefundPrivateDetailsResponseSchema,
  rejectManualRefundInputSchema,
  reassignManualRefundInputSchema,
  revealManualRefundPrivateDetailsInputSchema,
  submitManualRefundTransferInputSchema,
  verifyManualRefundDestinationInputSchema,
  uuidSchema,
  type ManualRefundDetailResponse,
  type ManualRefundListResponse,
  type ManualRefundPrivateDetailsResponse,
  type Paginated,
  type PaymentHistoryItem,
  type RefundHistoryItem,
  type RefundResponse,
  type TenantMember,
} from '@booking/contracts';
import { data as routeData } from 'react-router';
import type { Route } from './+types/transactions';
import { PaymentTransactionsPage } from '~/features/payments/components/payment-transactions-page';
import {
  ManualRefundWorkflow,
  type ManualRefundActionData,
} from '~/features/payments/components/manual-refund-workflow';
import { PAYMENT_FILTER_SPEC } from '~/features/payments/lib/payment-filters';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { apiPost } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';
import { RefundsPanel } from '~/features/payments/components/refunds-panel';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giao dịch · Tài chính · Tenant · BookingOS' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can, ctx } = await requireTenant(request, 'tenant.finance.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, PAYMENT_FILTER_SPEC);
  const canReadWorkflow = can('tenant.refunds.prepare');
  const status = manualRefundOperationStatusSchema.safeParse(url.searchParams.get('refundStatus'));
  const selectedId = uuidSchema.safeParse(url.searchParams.get('refundOperation'));
  const [response, refundsResponse, manualResponse, membersResponse] = await Promise.all([
    apiGet<Paginated<PaymentHistoryItem>>(apiPaths.tenant.payments, auth, {
      query: toApiQuery(apiFilters),
    }),
    apiGet<Paginated<RefundHistoryItem>>(apiPaths.tenant.paymentRefunds, auth, {
      query: { page: 1, pageSize: FETCH_ALL_PAGE_SIZE },
    }),
    canReadWorkflow
      ? apiGet<ManualRefundListResponse>(apiPaths.tenant.manualRefunds, auth, {
          query: {
            page: 1,
            pageSize: 50,
            ...(status.success ? { status: status.data } : {}),
            ...(url.searchParams.get('refundOverdue') === 'true' ? { overdue: true } : {}),
          },
          schema: manualRefundListResponseSchema,
        })
      : Promise.resolve(null),
    can('tenant.members.manage')
      ? apiGet<TenantMember[]>(apiPaths.tenant.members, auth)
      : Promise.resolve(null),
  ]);
  const manualQueue = manualResponse?.ok ? manualResponse.data : null;
  const detailResponse =
    canReadWorkflow && manualQueue?.workflowEnabled && selectedId.success
      ? await apiGet<ManualRefundDetailResponse>(
          apiPaths.tenant.manualRefund(selectedId.data),
          auth,
          { schema: manualRefundDetailResponseSchema },
        )
      : null;
  return {
    filters,
    result: response.ok ? response.data : null,
    error: response.ok ? null : (response.error ?? 'Không tải được lịch sử giao dịch.'),
    refunds: refundsResponse.ok ? (refundsResponse.data?.items ?? []) : [],
    refundError: refundsResponse.ok
      ? null
      : (refundsResponse.error ?? 'Không tải được lịch sử hoàn tiền.'),
    canManageRefunds: can('tenant.payouts.manage'),
    manualQueue,
    manualDetail: detailResponse?.ok ? detailResponse.data : null,
    manualError:
      manualResponse && !manualResponse.ok
        ? (manualResponse.error ?? 'Không tải được hàng đợi hoàn tiền thủ công.')
        : detailResponse && !detailResponse.ok
          ? (detailResponse.error ?? 'Không tải được chi tiết batch hoàn tiền.')
          : null,
    manualPermissions: {
      prepare: can('tenant.refunds.prepare'),
      approve: can('tenant.refunds.approve'),
      reveal: can('tenant.refunds.reveal'),
    },
    currentUserId: ctx.user.userId,
    makerOptions: membersResponse?.ok
      ? (membersResponse.data ?? [])
          .filter((member) => member.permissions.includes('tenant.refunds.prepare'))
          .map((member) => ({ value: member.userId, label: `${member.fullName} · ${member.email}` }))
      : [],
    nowIso: new Date().toISOString(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requireTenant(request);
  const contentType = request.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
    : Object.fromEntries(await request.formData());
  const intent = typeof body.intent === 'string' ? body.intent : '';

  if (intent === 'confirm-refund') {
    if (!can('tenant.payouts.manage')) return actionError('Bạn không có quyền xác nhận hoàn tiền.', 403);
    const refundId = String(body.refundId ?? '');
    const parsed = confirmManualRefundInputSchema.safeParse({
      reference: body.reference,
      evidenceKey: body.evidenceKey || undefined,
      note: body.note || undefined,
    });
    if (!parsed.success) return actionError('Cần mã tham chiếu hoàn tiền hợp lệ.', 400, parsed.error.flatten().fieldErrors);
    const result = await apiPost<RefundResponse>(
      apiPaths.tenant.paymentRefundConfirm(refundId),
      parsed.data,
      auth,
    );
    if (!result.ok) return actionError(result.error ?? 'Không xác nhận được hoàn tiền.', result.status || 400);
    return routeData<ManualRefundActionData>({ success: 'Đã xác nhận hoàn tiền.' });
  }

  const operationId = uuidSchema.safeParse(body.operationId);
  if (!operationId.success) return actionError(actionMessages.invalidIntent, 400);
  const config = manualActionConfig(intent);
  if (!config) return actionError(actionMessages.invalidIntent, 400);
  if (!can(config.permission)) return actionError('Bạn không có quyền thực hiện thao tác này.', 403);

  const input = { ...body };
  delete input.intent;
  delete input.operationId;
  const parsed = config.schema.safeParse(input);
  if (!parsed.success) {
    return actionError('Vui lòng kiểm tra lại thông tin đã nhập.', 400, parsed.error.flatten().fieldErrors, operationId.data);
  }
  const operationPath = apiPaths.tenant.manualRefundAction(operationId.data, config.apiAction);
  if (intent === 'reveal') {
    const result = await apiPost<ManualRefundPrivateDetailsResponse>(
      operationPath,
      parsed.data,
      auth,
      { signal: request.signal, schema: manualRefundPrivateDetailsResponseSchema },
    );
    if (!result.ok || !result.data) return actionError(result.error ?? 'Không mở được thông tin tài khoản.', result.status || 400, undefined, operationId.data);
    return routeData<ManualRefundActionData>(
      { operationId: operationId.data, privateDetails: result.data, success: 'Đã mở thông tin và ghi audit truy cập.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const result = await apiPost<unknown>(operationPath, parsed.data, auth, {
    signal: request.signal,
  });
  if (!result.ok) return actionError(result.error ?? config.error, result.status || 400, undefined, operationId.data);
  return routeData<ManualRefundActionData>({ operationId: operationId.data, success: config.success });
}

function manualActionConfig(intent: string) {
  const actions = {
    verify: { permission: 'tenant.refunds.prepare', schema: verifyManualRefundDestinationInputSchema, apiAction: 'verify', success: 'Tài khoản đã được xác minh và sẵn sàng chuyển.', error: 'Không thể xác minh tài khoản.' },
    claim: { permission: 'tenant.refunds.prepare', schema: claimManualRefundInputSchema, apiAction: 'claim', success: 'Bạn đã nhận xử lý batch này.', error: 'Không thể nhận xử lý batch.' },
    reassign: { permission: 'tenant.refunds.prepare', schema: reassignManualRefundInputSchema, apiAction: 'reassign', success: 'Đã bàn giao batch cho người phụ trách mới.', error: 'Không thể bàn giao batch.' },
    'submit-transfer': { permission: 'tenant.refunds.prepare', schema: submitManualRefundTransferInputSchema, apiAction: 'transfer', success: 'Giao dịch và biên lai đã gửi cho checker.', error: 'Không thể ghi nhận giao dịch chuyển tiền.' },
    approve: { permission: 'tenant.refunds.approve', schema: approveManualRefundInputSchema, apiAction: 'approve', success: 'Batch hoàn tiền đã được duyệt hoàn tất.', error: 'Không thể duyệt batch hoàn tiền.' },
    reject: { permission: 'tenant.refunds.approve', schema: rejectManualRefundInputSchema, apiAction: 'reject', success: 'Biên lai đã bị từ chối và trả lại maker.', error: 'Không thể từ chối biên lai.' },
    reopen: { permission: 'tenant.refunds.approve', schema: rejectManualRefundInputSchema, apiAction: 'reopen', success: 'Đã mở lại thông tin nhận tiền cho khách.', error: 'Không thể mở lại thông tin nhận tiền.' },
    reveal: { permission: 'tenant.refunds.reveal', schema: revealManualRefundPrivateDetailsInputSchema, apiAction: 'reveal', success: '', error: 'Không mở được thông tin tài khoản.' },
  } as const;
  return intent in actions ? actions[intent as keyof typeof actions] : null;
}

function actionError(error: string, status: number, fieldErrors?: Record<string, string[] | undefined>, operationId?: string) {
  return routeData<ManualRefundActionData>({ operationId, error, fieldErrors }, { status });
}

export default function TenantTransactions({ loaderData, actionData }: Route.ComponentProps) {
  const manualEnabled = loaderData.manualQueue?.workflowEnabled === true;
  const actionError = actionData && 'error' in actionData ? actionData.error : null;
  return (
    <PaymentTransactionsPage
      area="tenant"
      {...loaderData}
      supplementary={
        manualEnabled && loaderData.manualQueue ? (
          <ManualRefundWorkflow
            queue={loaderData.manualQueue}
            detail={loaderData.manualDetail}
            permissions={loaderData.manualPermissions}
            currentUserId={loaderData.currentUserId}
            makerOptions={loaderData.makerOptions}
            actionData={actionData as ManualRefundActionData | undefined}
            error={loaderData.manualError}
            nowIso={loaderData.nowIso}
          />
        ) : (
          <RefundsPanel
            refunds={loaderData.refunds}
            canManage={loaderData.canManageRefunds}
            error={actionError ?? loaderData.refundError}
          />
        )
      }
    />
  );
}
