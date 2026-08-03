import { data, redirect } from 'react-router';
import {
  createListingInputSchema,
  type CancellationPolicyResponse,
  type ListingTypeResponse,
  type ListingResponse,
  type DepositRequirementResponse,
} from '@booking/contracts';
import type { Route } from './+types/new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { FormPage } from '~/components/form-page';
import { PageHeader } from '~/components/page-header';
import { ListingForm } from '~/features/partner/components/listing-form';
import {
  ListingStructureChoices,
  ListingTypeChoiceList,
} from '~/features/partner/components/listings/listing-type-choices';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng mới · Đối tác · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [types, policies] = await Promise.all([
    apiGet<ListingTypeResponse[]>(apiPaths.partner.listingTypes, auth),
    apiGet<CancellationPolicyResponse[]>(apiPaths.partner.cancellationPolicies, auth),
  ]);
  const listingTypes = types.data ?? [];
  const url = new URL(request.url);
  const typeId = url.searchParams.get('type');
  const mode = url.searchParams.get('mode');
  const selectedType = listingTypes.find((type) => type.id === typeId) ?? null;
  if (
    selectedType?.structure === 'grouped' ||
    (selectedType?.structure === 'flexible' && mode === 'grouped')
  ) {
    return redirect(dashboardPaths.partner.newListingGroup(selectedType.id));
  }
  const requirement = selectedType
    ? await apiGet<DepositRequirementResponse>(apiPaths.partner.listingDepositRequirement, auth, {
        query: { listingTypeId: selectedType.id },
      })
    : null;
  return {
    listingTypes,
    selectedType,
    mode,
    cancellationPolicies: policies.data ?? [],
    partnerId: membership.partnerId,
    minimumDepositPercent: requirement?.ok
      ? (requirement.data?.minimumDepositPercent ?? null)
      : null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  if (!can('partner.listings.write')) {
    return data({ error: 'Không có quyền tạo tin đăng.', fieldErrors: null }, { status: 403 });
  }
  const parsed = createListingInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPost<ListingResponse>(apiPaths.partner.listings, parsed.data, auth);
  if (!res.ok) {
    return data(
      { error: res.error ?? 'Tạo tin đăng không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  if (!res.data) {
    return data({ error: 'API không trả về mã bản nháp.', fieldErrors: null }, { status: 502 });
  }
  return redirect(`${dashboardPaths.partner.listing(res.data.id)}?created=1`);
}

export default function NewListingPage({ loaderData, actionData }: Route.ComponentProps) {
  const type = loaderData.selectedType;

  if (!type) {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-5">
        <PageHeader title="Tạo tin đăng" description="Chọn loại dịch vụ để bắt đầu." />
        <ListingTypeChoiceList
          listingTypes={loaderData.listingTypes}
          hrefFor={(listingType) => dashboardPaths.partner.listingNew(listingType.id)}
        />
      </div>
    );
  }

  if (type.structure === 'flexible' && !loaderData.mode) {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-5">
        <PageHeader
          title={`Tạo ${type.name}`}
          description="Chọn cấu trúc phù hợp với nội dung bạn muốn đăng."
        />
        <ListingStructureChoices type={type} />
      </div>
    );
  }

  return (
    <FormPage
      backTo={dashboardPaths.partner.listings}
      backLabel="Tin đăng"
      title={`Tạo ${type.itemLabel || 'hạng mục'} mới`}
      description={`Hoàn thiện thông tin ${type.name}, giá và chính sách. Tin sẽ được lưu nháp để bạn kiểm tra trước khi gửi duyệt.`}
    >
      <ListingForm
        listingTypes={[type]}
        partnerId={loaderData.partnerId}
        lockedListingTypeId={type.id}
        cancellationPolicies={loaderData.cancellationPolicies}
        minimumDepositPercent={loaderData.minimumDepositPercent}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </FormPage>
  );
}
