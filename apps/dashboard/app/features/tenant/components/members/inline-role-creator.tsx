import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import type { TenantPermissionKey } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { ChevronDown, Plus } from 'lucide-react';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { PermissionGrid } from './permission-grid';
import type { AssignableRole } from './role-multi-select';

interface CreateRoleActionData {
  intent?: string;
  ok?: boolean;
  roleId?: string | null;
  error?: string | null;
  fieldErrors?: Record<string, string[]> | null;
}

/**
 * Collapsible "Tạo vai trò mới" panel embedded in the invite/edit member form —
 * removes the "create a role before you can invite anyone" ordering problem.
 * Rendered by the caller only when `canCreateRole` (`tenant.roles.manage`).
 *
 * Posts `intent=create-role` to the SAME route action the member form itself
 * submits to, via its own fetcher — the two never collide because a fetcher's
 * result lands on `fetcher.data`, not the route's `actionData`. On success it
 * hands the freshly created role back to the parent (`onCreated`), which adds
 * it to the picker and selects it, with no reload or refetch.
 */
export function InlineRoleCreator({ onCreated }: { onCreated: (role: AssignableRole) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<TenantPermissionKey[]>([]);
  const fetcher = useFetcher<CreateRoleActionData>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const submittedRef = useRef<{ name: string; permissions: TenantPermissionKey[] } | null>(null);

  const error = fetcher.data?.error ?? null;
  const fieldErrors = fetcher.data?.fieldErrors ?? null;
  const canSubmit = name.trim().length >= 2 && permissions.length > 0;

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data?.ok || fetcher.data.intent !== 'create-role') return;
    const submitted = submittedRef.current;
    const roleId = fetcher.data.roleId;
    if (!submitted || !roleId) return;
    submittedRef.current = null;
    onCreated({ id: roleId, name: submitted.name, permissions: submitted.permissions });
    setName('');
    setPermissions([]);
    setOpen(false);
    // `onCreated` is a fresh closure every render; re-running this effect for
    // that alone would fire it a second time for the same fetcher result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const submit = (): void => {
    const trimmedName = name.trim();
    submittedRef.current = { name: trimmedName, permissions };
    run(() =>
      fetcher.submit(
        { intent: 'create-role', name: trimmedName, permissions },
        { method: 'post', encType: 'application/json' },
      ),
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group rounded-lg border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Plus className="size-4 text-primary" aria-hidden="true" /> Tạo vai trò mới
          </span>
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-has-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t px-4 py-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="new-role-name">Tên vai trò</Label>
            <Input
              id="new-role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ví dụ: Lễ tân"
            />
            {fieldErrors?.name?.length ? (
              <p className="text-xs text-destructive">{fieldErrors.name[0]}</p>
            ) : null}
          </div>
          <PermissionGrid value={permissions} onChange={setPermissions} error={fieldErrors?.permissions} />
          <div className="flex justify-end">
            <Button type="button" size="control" disabled={!canSubmit || busy} onClick={submit}>
              {busy ? 'Đang tạo...' : 'Tạo vai trò'}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
