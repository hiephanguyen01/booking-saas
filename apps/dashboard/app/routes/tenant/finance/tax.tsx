import type { Route } from './+types/tax';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import {
  handleTaxOperationsAction,
  loadTaxOperations,
} from '~/features/tenant/server/tax-operations.server';
import { TaxOperationsPage } from '~/features/tenant/components/finance/tax-operations-page';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Thuế đối tác · Tài chính · Tenant · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.finance.read');
  return loadTaxOperations(auth, {
    canManage: can('tenant.payouts.manage'),
    canReadPartners: can('tenant.partners.read'),
  });
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requireTenant(request);
  if (!can('tenant.payouts.manage')) {
    return Response.json({ error: 'Bạn không có quyền vận hành nghĩa vụ thuế.' }, { status: 403 });
  }
  return handleTaxOperationsAction(request, auth);
}

export default function TenantTaxOperations({ loaderData }: Route.ComponentProps) {
  return <TaxOperationsPage {...loaderData} />;
}
