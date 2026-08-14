import { useMemo } from 'react';
import type { PartnerPermissionKey, TenantPermissionKey } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import type { AssignableRole } from './role-multi-select';

/**
 * The union of every selected role's permissions, grouped the same way the
 * tick grid is. Nobody can add two role permission sets up in their head, so
 * this is what actually tells the operator what they are about to grant —
 * treated as a requirement of the form, not decoration.
 *
 * Generic over the permission key `K` so the same component serves both
 * tiers — the caller passes its own catalog (`TENANT_PERMISSION_GROUPS`/
 * `_LABELS` or `PARTNER_PERMISSION_GROUPS`/`_LABELS` from
 * `~/constants/permissions`) rather than this component assuming tenant
 * scope, which is what left it permanently showing the tenant-only fallback
 * message on partner screens.
 */
export function PermissionPreview<K extends TenantPermissionKey | PartnerPermissionKey>({
  roles,
  selectedRoleIds,
  permissionsAvailable,
  groups,
  labels,
  unavailableMessage,
}: {
  roles: AssignableRole[];
  selectedRoleIds: string[];
  /**
   * False when the caller has no permission data for these roles at all
   * (tenant tier only, when the signed-in caller lacks `tenant.roles.manage`
   * — `roles` then carries no permission arrays, see `AssignableRole`) and
   * this preview has nothing to union, so it shows `unavailableMessage`
   * instead of silently claiming "no quyền".
   */
  permissionsAvailable: boolean;
  groups: { label: string; keys: K[] }[];
  labels: Record<K, string>;
  unavailableMessage: string;
}) {
  const permissionSet = useMemo(() => {
    const selected = roles.filter((role) => selectedRoleIds.includes(role.id));
    return new Set(selected.flatMap((role) => role.permissions));
  }, [roles, selectedRoleIds]);

  if (selectedRoleIds.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Chọn ít nhất một vai trò để xem quyền tổng hợp.
      </p>
    );
  }

  if (!permissionsAvailable) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        {unavailableMessage}
      </p>
    );
  }

  const visibleGroups = groups
    .map((group) => ({
      label: group.label,
      keys: group.keys.filter((key) => permissionSet.has(key)),
    }))
    .filter((group) => group.keys.length > 0);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
      <p className="text-xs font-semibold text-muted-foreground">
        {permissionSet.size} quyền hiệu lực từ {selectedRoleIds.length} vai trò đã chọn
      </p>
      {visibleGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có quyền nào.</p>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.keys.map((key) => (
                  <Badge key={key} variant="secondary" className="font-normal">
                    {labels[key]}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
