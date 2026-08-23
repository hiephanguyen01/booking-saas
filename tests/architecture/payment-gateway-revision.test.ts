import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const registryPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/gateway-registry.ts',
);

/**
 * Durable checkout treats a missing config as the only legacy/configless mock case.
 * Any configured provider revision — including an explicit local mock provider —
 * must retain its immutable config id so new Payments never enter legacy resolution.
 */
describe('payment gateway revision architecture', () => {
  it('preserves the revision id for every configured gateway, including mock', () => {
    const source = readFileSync(registryPath, 'utf8');

    expect(source).toContain('if (!cfg) {');
    expect(source).not.toContain("if (!cfg || cfg.gateway === 'mock') {");
    expect(source).toContain(
      "gateway: cfg.gateway === 'mock' ? this.mock : this.adapterForConfig(cfg),",
    );
    expect(source).toContain('configRevisionId: cfg.id,');
    expect(source).toContain('settings: cfg.settings,');
  });
});
