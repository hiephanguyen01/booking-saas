import type { PartnerPermissionKey, TenantPermissionKey } from '@booking/contracts';
import { Checkbox } from '@booking/ui/components/ui/checkbox';

/**
 * A role this member/invite form can offer, trimmed to what the picker and the
 * permission preview need. Shared by both tiers, so `permissions` is typed as
 * the union of both key spaces rather than pretending every role is a tenant
 * role — `PermissionPreview` picks the matching label/group catalog by tier.
 *
 * Tenant tier: sourced from `GET /tenant/roles/assignable` (`{id, name}`,
 * gated on `tenant.members.manage` — everyone who can invite staff), enriched
 * with `permissions` from `GET /tenant/roles` only when the caller also holds
 * `tenant.roles.manage` (that endpoint's own gate). A caller with
 * members-only access still sees every role name to pick from; they just
 * can't see the permission breakdown, so `permissions` comes back empty for
 * them — see `PermissionPreview`'s `permissionsAvailable` flag, which is the
 * signal for "empty because unauthorized" vs. "empty because none selected".
 *
 * Partner tier: sourced from `GET /partner/roles/assignable` alone —
 * `permissions` is always populated (no second, more-privileged endpoint
 * exists on this tier to fall back on), so `permissionsAvailable` is always
 * true there.
 */
export interface AssignableRole {
  id: string;
  name: string;
  permissions: (TenantPermissionKey | PartnerPermissionKey)[];
}

/**
 * Which of the tenant's roles apply to this member. A checkbox list, not a
 * dropdown — multi-role is the central feature here (a member holding two
 * roles at once is the ordinary case, not an edge case), and a single-select
 * control would silently defeat that.
 */
export function RoleMultiSelect({
  roles,
  value,
  onChange,
  error,
}: {
  roles: AssignableRole[];
  value: string[];
  onChange: (next: string[]) => void;
  error?: string[];
}) {
  const toggle = (roleId: string, checked: boolean): void => {
    onChange(checked ? [...value.filter((id) => id !== roleId), roleId] : value.filter((id) => id !== roleId));
  };

  if (roles.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Chưa có vai trò nào để chọn.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {roles.map((role) => {
          const id = `role-${role.id}`;
          return (
            <label
              key={role.id}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/30"
            >
              <Checkbox
                id={id}
                checked={value.includes(role.id)}
                onCheckedChange={(checked) => toggle(role.id, checked === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{role.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {role.permissions.length > 0 ? `${role.permissions.length} quyền` : 'Chưa rõ số quyền'}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error?.length ? (
        <p className="text-xs text-destructive" role="alert">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}
