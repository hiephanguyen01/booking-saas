import { useMemo } from 'react';
import { Badge } from '@booking/ui/components/ui/badge';
import { TENANT_PERMISSION_GROUPS, TENANT_PERMISSION_LABELS } from '~/constants/permissions';
import type { AssignableRole } from './role-multi-select';

/**
 * The union of every selected role's permissions, grouped the same way the
 * tick grid is. Nobody can add two role permission sets up in their head, so
 * this is what actually tells the operator what they are about to grant —
 * treated as a requirement of the form, not decoration.
 */
export function PermissionPreview({
  roles,
  selectedRoleIds,
  permissionsAvailable,
}: {
  roles: AssignableRole[];
  selectedRoleIds: string[];
  /**
   * False when the signed-in caller lacks `tenant.roles.manage` — `roles` then
   * carries no permission arrays (see `AssignableRole`) and this preview has
   * nothing to union, so it says so instead of silently claiming "no quyền".
   */
  permissionsAvailable: boolean;
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
        Bạn cần quyền Quản lý vai trò để xem chi tiết quyền của các vai trò đã chọn.
      </p>
    );
  }

  const groups = TENANT_PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    keys: group.keys.filter((key) => permissionSet.has(key)),
  })).filter((group) => group.keys.length > 0);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
      <p className="text-xs font-semibold text-muted-foreground">
        {permissionSet.size} quyền hiệu lực từ {selectedRoleIds.length} vai trò đã chọn
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có quyền nào.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.keys.map((key) => (
                  <Badge key={key} variant="secondary" className="font-normal">
                    {TENANT_PERMISSION_LABELS[key]}
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
