import { describe, expect, it } from 'vitest';
import { readSource, repoPath } from './support/repo';

describe('Manual refund observability architecture guard', () => {
  it('ensures platform health reader SQL never queries forbidden PII or secret columns', () => {
    const readerSource = readSource(
      repoPath('apps/api/src/modules/tenancy/infrastructure/repositories/prisma-platform-health.reader.ts'),
    );

    const forbiddenColumns = [
      'destination_account',
      'transfer_reference',
      'evidence_object_key',
      'ciphertext',
      'key_version',
    ];

    for (const column of forbiddenColumns) {
      expect(readerSource).not.toContain(column);
    }
  });

  it('ensures manual refund SLA worker never logs error.message or raw error strings', () => {
    const workerSource = readSource(
      repoPath('apps/api/src/modules/payments/infrastructure/manual-refund-sla.worker.ts'),
    );

    expect(workerSource).not.toContain('error.message');
    expect(workerSource).not.toContain('String(error)');
    expect(workerSource).not.toMatch(/logger\.[a-z]+\([^)]*(?:error\.message|String\(error\))/);
  });
});
