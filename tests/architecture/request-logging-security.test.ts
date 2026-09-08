import { describe, expect, it } from 'vitest';
import { readSource, repoPath } from './support/repo';

describe('request logging security', () => {
  it('redacts booking bearer credentials from request headers', () => {
    const appModule = readSource(repoPath('apps/api/src/app.module.ts'));

    expect(appModule).toContain(`'req.headers["x-booking-access-grant"]'`);
    expect(appModule).toContain(`'req.headers["x-booking-otp"]'`);
  });

  it('ensures manual refund readiness adapter never logs secrets/exceptions and contracts contain no arbitrary fields', () => {
    const adapterSource = readSource(
      repoPath('apps/api/src/modules/payments/infrastructure/manual-refund-readiness.adapter.ts'),
    );
    const paymentContracts = readSource(
      repoPath('packages/contracts/src/contracts/payment.ts'),
    );

    // Readiness adapter never interpolates environment variables or exception objects into logger/console
    expect(adapterSource).not.toMatch(/logger\.[a-z]+\([^)]*(?:process\.env|err|error|exception)/i);
    expect(adapterSource).not.toMatch(/console\.[a-z]+\([^)]*(?:process\.env|err|error|exception)/i);

    // Readiness contracts are strict and have no arbitrary payload fields (z.record, z.any, z.unknown)
    expect(paymentContracts).toContain('manualRefundReadinessResponseSchema');
    expect(paymentContracts).toContain('manualRefundReadinessCheckSchema');
    expect(paymentContracts).not.toMatch(/manualRefundReadiness(?:Check|Response)Schema[\s\S]*?z\.(?:record|any|unknown)/);
  });
});

