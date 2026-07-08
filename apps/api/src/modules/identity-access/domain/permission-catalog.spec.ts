import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG, SYSTEM_ROLES } from './permission-catalog';

describe('permission catalog', () => {
  it('has unique keys of the form scope.resource.action', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PERMISSION_CATALOG) {
      expect(p.key).toMatch(/^(platform|tenant|partner)\.[a-z]+\.[a-z]+$/);
      expect(p.key.startsWith(`${p.scopeLevel}.`)).toBe(true);
    }
  });

  it('system roles only reference catalog permissions of their own scope', () => {
    const byKey = new Map(PERMISSION_CATALOG.map((p) => [p.key, p]));
    for (const role of SYSTEM_ROLES) {
      expect(role.permissions.length).toBeGreaterThan(0);
      for (const key of role.permissions) {
        const perm = byKey.get(key);
        expect(perm, `${role.name} references unknown permission ${key}`).toBeDefined();
        expect(perm?.scopeLevel).toBe(role.scopeLevel);
      }
    }
  });

  it('Manager excludes exactly roles.manage and settings.manage from Tenant Owner', () => {
    const owner = SYSTEM_ROLES.find((r) => r.name === 'Tenant Owner')!;
    const manager = SYSTEM_ROLES.find((r) => r.name === 'Manager')!;
    const excluded = owner.permissions.filter((p) => !manager.permissions.includes(p));
    expect(excluded.sort()).toEqual(['tenant.roles.manage', 'tenant.settings.manage']);
  });
});
