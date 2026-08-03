import { data, Link, redirect } from 'react-router';
import { createListingGroupInputSchema, type ListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { FormPage } from '~/components/form-page';
import { WarningCallout } from '~/components/warning-callout';
import { ListingGroupForm } from '~/features/partner/components/listing-group-form';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng nhiều hạng mục mới · Đối tác · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const typeId = new URL(request.url).searchParams.get('type');
  const types = await apiGet<ListingTypeResponse[]>(apiPaths.partner.listingTypes, auth);
  const requestedType = (types.data ?? []).find((type) => type.id === typeId);
  const listingType =
    requestedType && requestedType.structure !== 'standalone' ? requestedType : null;
  return { listingType, partnerId: membership.partnerId };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership, can } = await requirePartner(request);
  if (!can('partner.listings.write'))
    return data({ error: 'Không có quyền tạo tin đăng.', fieldErrors: null }, { status: 403 });
  const parsed = createListingGroupInputSchema.safeParse(await request.json());
  if (!parsed.success)
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPost<{ id: string }>(
    apiPaths.partner.listingGroups,
    { ...parsed.data, partnerId: membership.partnerId },
    auth,
  );
  if (!res.ok || !res.data)
    return data(
      { error: res.error ?? 'Tạo tin đăng không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  return redirect(`${dashboardPaths.partner.listingGroup(res.data.id)}?created=1`);
}

export default function NewListingGroupPage({ loaderData, actionData }: Route.ComponentProps) {
  if (!loaderData.listingType) {
    return (
      <FormPage
        backTo={dashboardPaths.partner.listings}
        backLabel="Tin đăng"
        title="Không hỗ trợ tin đăng nhiều hạng mục"
      >
        <WarningCallout title="Loại dịch vụ này tạo tin đăng đơn, không phải tin đăng nhiều hạng mục.">
          <p>Hãy dùng “Tạo bài đăng” để tạo tin đăng đơn cho loại dịch vụ này.</p>
          <Button asChild size="sm" className="mt-2">
            <Link to={dashboardPaths.partner.listingNew()}>Tạo bài đăng</Link>
          </Button>
        </WarningCallout>
      </FormPage>
    );
  }

  const itemLabel = loaderData.listingType.itemLabel || 'hạng mục';
  return (
    <FormPage
      backTo={dashboardPaths.partner.listings}
      backLabel="Tin đăng"
      title={`Tạo tin đăng nhiều ${itemLabel}`}
      description={`Thêm thông tin chung của ${loaderData.listingType.name}. Sau khi lưu, bạn sẽ thêm giá và lịch đặt cho từng ${itemLabel}.`}
    >
      <ListingGroupForm
        partnerId={loaderData.partnerId}
        listingType={loaderData.listingType}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </FormPage>
  );
}
