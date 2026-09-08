import { describe, expect, it } from 'vitest';
import { readSource, repoPath } from './support/repo';

const MUTATION_USE_CASES = [
  'apps/api/src/modules/payments/application/use-cases/submit-customer-manual-refund-destination.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/verify-manual-refund-destination.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/claim-manual-refund.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/reassign-manual-refund.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/create-manual-refund-evidence-upload.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/submit-manual-refund-transfer.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/approve-manual-refund.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/reject-manual-refund.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/reopen-manual-refund-destination.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/reveal-manual-refund-private-details.use-case.ts',
  'apps/api/src/modules/payments/application/use-cases/break-glass-complete-manual-refund.use-case.ts',
] as const;

describe('Manual Refund pause coverage architecture guard', () => {
  it.each(MUTATION_USE_CASES)('gates %s behind getWorkflowState and ManualRefundWorkflowPaused', (path) => {
    const source = readSource(repoPath(path));
    expect(source).toContain('getWorkflowState');
    expect(source).toContain('ManualRefundWorkflowPaused');
  });
});
