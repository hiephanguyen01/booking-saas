import { describe, expect, it } from 'vitest';
import { readSource, repoPath } from './support/repo';

describe('Manual Refund V2 production readiness architecture guard', () => {
  it('requires production gate runbook to document mandatory stop and rollback conditions', () => {
    const runbook = readSource(
      repoPath('docs/runbooks/manual-refund-v2-production-gate.md'),
    );

    const requiredStopConditions = [
      'readiness.ready=false',
      'manualRefunds.severity=critical',
      'duplicate debit',
      'amount mismatch',
      'unverified webhook',
      'customer_not_received',
      'break-glass',
      'pause-workflow',
      'rollback SHA',
    ];

    for (const condition of requiredStopConditions) {
      expect(runbook).toContain(condition);
    }
  });

  it('asserts .env.deploy.example documents alert thresholds and contains no real secrets or PII', () => {
    const envExample = readSource(repoPath('.env.deploy.example'));

    // Must document canary alert thresholds
    expect(envExample).toContain('MANUAL_REFUND_ALERT_OLDEST_OPEN_MINUTES=60');
    expect(envExample).toContain('MANUAL_REFUND_ALERT_OVERDUE_COUNT=1');
    expect(envExample).toContain('MANUAL_REFUND_ALERT_NOT_RECEIVED_COUNT=1');
    expect(envExample).toContain('MANUAL_REFUND_ALERT_BREAK_GLASS_COUNT=1');

    // Must not contain real secrets, real credentials or real financial data
    expect(envExample).not.toMatch(/postgres:\/\/[^:]+:(?!CHANGE_ME)[^@]+@/);
    expect(envExample).not.toMatch(/MANUAL_REFUND_PII_FINGERPRINT_KEY=(?!CHANGE_ME)[a-zA-Z0-9+/=]{32,}/);
    expect(envExample).not.toMatch(/STK\d{6,}/); // Real bank account number pattern
    expect(envExample).not.toMatch(/FT\d{10,}/); // Real bank transfer reference pattern
  });
});
