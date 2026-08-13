import type { TenantPermissionKey } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { TENANT_PERMISSION_GROUPS, TENANT_PERMISSION_LABELS } from '~/constants/permissions';

/**
 * The 24-key tick grid behind every tenant role's permission set, grouped by
 * `TENANT_PERMISSION_GROUPS` and labelled by `TENANT_PERMISSION_LABELS`.
 *
 * Created in Task 12 for the inline role creator embedded in the invite/edit
 * member form, at the path Task 13's standalone role-create/role-edit forms
 * expect — Task 13 imports this component rather than building a second grid.
 * Kept a plain controlled `value`/`onChange` component (not bound to a specific
 * react-hook-form schema) so both call sites can wire it to their own form
 * instance via `Controller`.
 *
 * `readOnly` (added in Task 13) renders every checkbox disabled and hides the
 * per-group "chọn tất cả" toggle — the standalone role-edit screen's view of a
 * system role, which the backend refuses to modify (`SYSTEM_ROLE_IMMUTABLE`).
 * `InlineRoleCreator` never passes it, so its always-editable grid is unchanged.
 */
export function PermissionGrid({
  value,
  onChange,
  error,
  readOnly = false,
}: {
  value: TenantPermissionKey[];
  onChange: (next: TenantPermissionKey[]) => void;
  error?: string[];
  readOnly?: boolean;
}) {
  const toggle = (key: TenantPermissionKey, checked: boolean): void => {
    onChange(checked ? [...value.filter((item) => item !== key), key] : value.filter((item) => item !== key));
  };

  const toggleGroup = (keys: TenantPermissionKey[], checked: boolean): void => {
    onChange(checked ? [...new Set([...value, ...keys])] : value.filter((item) => !keys.includes(item)));
  };

  return (
    <div className="space-y-3">
      {TENANT_PERMISSION_GROUPS.map((group) => {
        const checkedCount = group.keys.filter((key) => value.includes(key)).length;
        const allChecked = checkedCount === group.keys.length;
        return (
          <div key={group.label} className="overflow-hidden rounded-lg border">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/15 px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {group.label}{' '}
                <span className="tabular-nums">
                  ({checkedCount}/{group.keys.length})
                </span>
              </p>
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleGroup(group.keys, !allChecked)}
                >
                  {allChecked ? 'Bỏ chọn' : 'Chọn tất cả'}
                </Button>
              )}
            </div>
            <div className="grid gap-0.5 p-2 sm:grid-cols-2">
              {group.keys.map((key) => {
                const id = `permission-${key}`;
                return (
                  <label
                    key={key}
                    htmlFor={id}
                    className={
                      readOnly
                        ? 'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground'
                        : 'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40'
                    }
                  >
                    <Checkbox
                      id={id}
                      checked={value.includes(key)}
                      disabled={readOnly}
                      onCheckedChange={(checked) => toggle(key, checked === true)}
                    />
                    {TENANT_PERMISSION_LABELS[key]}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      {error?.length ? (
        <p className="text-xs text-destructive" role="alert">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}
