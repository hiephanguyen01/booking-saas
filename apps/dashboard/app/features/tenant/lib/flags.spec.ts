import { describe, expect, it } from 'vitest';
import {
  FLAGS_READ_ERROR,
  TENANT_FLAGS_PATH,
  toPartnerPromotionsState,
  type FlagsReadResult,
} from './flags';

describe('tenant feature flags', () => {
  it('points at the path the API actually mounts', () => {
    // Regression guard for the dead marketplace toggle: TenantSettingsController is
    // @Controller('tenant') + @Get('flags'), so '/tenant/settings/flags' 404s.
    expect(TENANT_FLAGS_PATH).toBe('/tenant/flags');
  });

  describe('toPartnerPromotionsState', () => {
    it('reports the flag as enabled when the read succeeds', () => {
      const res: FlagsReadResult = { ok: true, data: { partnerPromotionsEnabled: true } };
      expect(toPartnerPromotionsState(res)).toEqual({ ok: true, enabled: true });
    });

    it('reports the flag as disabled only when the API actually says so', () => {
      const res: FlagsReadResult = { ok: true, data: { partnerPromotionsEnabled: false } };
      expect(toPartnerPromotionsState(res)).toEqual({ ok: true, enabled: false });
    });

    it('surfaces a failed read instead of rendering it as "off"', () => {
      const res: FlagsReadResult = { ok: false, data: null, error: 'Not Found' };
      const state = toPartnerPromotionsState(res);

      expect(state).toEqual({ ok: false, error: 'Not Found' });
      // The bug this replaces: a 404 collapsed to `enabled: false`.
      expect(state).not.toHaveProperty('enabled');
    });

    it('falls back to a readable message when the failure carries none', () => {
      expect(toPartnerPromotionsState({ ok: false, data: null })).toEqual({
        ok: false,
        error: FLAGS_READ_ERROR,
      });
    });

    it('treats a 2xx with no body as a failed read, not as "off"', () => {
      expect(toPartnerPromotionsState({ ok: true, data: null })).toEqual({
        ok: false,
        error: FLAGS_READ_ERROR,
      });
    });

    it('returns null when the user may not manage settings, so the section is hidden', () => {
      expect(toPartnerPromotionsState(null)).toBeNull();
    });
  });
});
