import { describe, expect, it } from 'vitest';
import { readSource, repoPath } from './support/repo';

const detailRoute = readSource(repoPath('apps/dashboard/app/routes/admin/tenants/detail.tsx'));
const actions = readSource(
  repoPath('apps/dashboard/app/features/admin/server/tenant-detail-actions.server.ts'),
);
const card = readSource(
  repoPath('apps/dashboard/app/features/admin/components/tenant-manual-refund-workflow-card.tsx'),
);
const apiPaths = readSource(repoPath('apps/dashboard/app/constants/api-paths.ts'));

describe('Manual Refund V2 rollout control architecture', () => {
  it('keeps the one-way tenant rollout behind platform.tenants.write and the dashboard BFF', () => {
    expect(detailRoute).toContain("can('platform.tenants.write')");
    expect(detailRoute).toContain('MANUAL_REFUND_V2_TENANT_FLAG');
    expect(detailRoute).toContain('TenantManualRefundWorkflowCard');

    expect(card).toContain('ConfirmButton');
    expect(card).toContain("intent: 'enable-manual-refund-v2'");
    expect(card).not.toContain('fetch(');

    expect(actions).toContain("intent === 'enable-manual-refund-v2'");
    expect(actions).toContain("requirePlatform(request, 'platform.tenants.write')");
    expect(actions).toContain('apiPaths.platform.manualRefundWorkflowEnable(id)');
    expect(actions).toContain("Số hồ sơ được tạo: ${created.toLocaleString('vi-VN')}.");
    expect(apiPaths).toContain('manualRefundWorkflowEnable');
    expect(apiPaths).toContain('`/platform/tenants/${segment(tenantId)}/refunds/enable-workflow`');
  });
});
