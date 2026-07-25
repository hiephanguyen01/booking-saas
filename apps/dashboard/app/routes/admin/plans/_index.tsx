import { useEffect, useState, type FormEvent } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type { PlanResponse } from '@booking/contracts';
import { DataTable } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import {
  handlePlansAction,
  type PlansActionResult,
} from '~/features/admin/server/plans-actions.server';
import { buildPlanColumns } from '~/features/admin/components/plans/plan-table-columns';
import { CreatePlanCard } from '~/features/admin/components/plans/create-plan-card';
import { EditPlanDialog } from '~/features/admin/components/plans/edit-plan-dialog';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Gói dịch vụ · Bookify Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.plans.manage');
  const res = await apiGet<PlanResponse[]>('/admin/plans', auth);
  return { plans: res.ok ? (res.data ?? []) : [], error: res.ok ? null : res.error };
}

export async function action({ request }: Route.ActionArgs) {
  return handlePlansAction(request);
}

export default function PlansPage({ loaderData, actionData }: Route.ComponentProps) {
  const { plans, error } = loaderData;
  const result = (actionData ?? null) as PlansActionResult | null;
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);

  const [editing, setEditing] = useState<PlanResponse | null>(null);

  // Close the edit dialog once its update succeeds.
  useEffect(() => {
    if (result?.scope === 'update' && result.ok) setEditing(null);
  }, [result]);

  const createError = result?.scope === 'create' && result.error ? result.error : null;
  const createFieldErrors = result?.scope === 'create' ? (result.fieldErrors ?? null) : null;
  const createOk = result?.scope === 'create' && result.ok ? result.message : null;
  const deleteError = result?.scope === 'delete' && result.error ? result.error : null;
  const editError =
    result?.scope === 'update' && result.id === editing?.id && result.error ? result.error : null;
  const editFieldErrors =
    result?.scope === 'update' && result.id === editing?.id ? (result.fieldErrors ?? null) : null;

  const handleDelete = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  const columns = buildPlanColumns({ onEdit: setEditing, onDelete: handleDelete, busy });

  return (
    <div className="space-y-6" aria-busy={busy}>
      <PageHeader
        title="Gói dịch vụ"
        description="Định nghĩa các gói đăng ký, hạn mức, và theo dõi doanh thu định kỳ."
      />

      <ErrorBanner error={error ? `Không tải được danh sách gói: ${error}` : null} />
      <ErrorBanner error={deleteError} />

      <fieldset disabled={busy} className="contents">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="overflow-x-auto">
              <DataTable
                columns={columns}
                data={plans}
                getRowKey={(p) => p.id}
                emptyMessage="Chưa có gói nào. Tạo gói đầu tiên ở bên phải."
              />
            </div>
          </div>

          <CreatePlanCard
            ok={createOk ?? null}
            error={createError}
            fieldErrors={createFieldErrors}
          />
        </div>
      </fieldset>

      <EditPlanDialog
        editing={editing}
        onClose={() => setEditing(null)}
        error={editError}
        fieldErrors={editFieldErrors}
        busy={busy}
      />
    </div>
  );
}
