import { data, Link, redirect } from 'react-router';
import {
  createListingInputSchema,
  type CancellationPolicySummary,
  type ListingTypeResponse,
  type DepositRequirementResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import type { Route } from './+types/new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { ListingForm } from '~/features/partner/components/listing-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng mới · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [types, policies] = await Promise.all([
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<CancellationPolicySummary[]>('/partner/cancellation-policies', auth),
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
    return redirect(`/partner/listing-groups/new?type=${selectedType.id}`);
  }
  const requirement = selectedType
    ? await apiGet<DepositRequirementResponse>('/partner/listings/deposit-requirement', auth, {
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
  const res = await apiPost('/partner/listings', parsed.data, auth);
  if (!res.ok) {
    return data(
      { error: res.error ?? 'Tạo tin đăng không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  return redirect('/partner/listings');
}

export default function NewListingPage({ loaderData, actionData }: Route.ComponentProps) {
  if (!loaderData.selectedType) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Tạo bài đăng" description="Chọn loại dịch vụ để bắt đầu." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loaderData.listingTypes.map((type) => (
            <Card key={type.id}>
              <CardHeader>
                <CardTitle>{type.name}</CardTitle>
                <CardDescription>
                  {type.structure === 'grouped'
                    ? `Một bài đăng chứa nhiều ${type.itemLabel || 'hạng mục'}.`
                    : type.structure === 'flexible'
                      ? 'Có thể tạo độc lập hoặc theo nhóm.'
                      : 'Một hạng mục độc lập.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link to={`/partner/listings/new?type=${type.id}`}>Chọn {type.name}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  if (loaderData.selectedType.structure === 'flexible' && !loaderData.mode) {
    const type = loaderData.selectedType;
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title={`Tạo ${type.name}`}
          description="Chọn cấu trúc phù hợp với nội dung bạn muốn đăng."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Một hạng mục</CardTitle>
              <CardDescription>Tạo một lựa chọn có thể đặt độc lập.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to={`/partner/listings/new?type=${type.id}&mode=standalone`}>
                  Tạo hạng mục độc lập
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Nhiều {type.itemLabel || 'hạng mục'}</CardTitle>
              <CardDescription>Một bài đăng chung chứa nhiều lựa chọn có thể đặt.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to={`/partner/listings/new?type=${type.id}&mode=grouped`}>
                  Tạo bài đăng nhóm
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div>
        <BackLink to="/partner/listings" label="Tin đăng" className="mb-2" />
        <PageHeader
          title="Tin đăng mới"
          description="Tạo tin đăng mới; sau khi tạo hãy gửi duyệt để hiển thị."
        />
      </div>
      <ListingForm
        listingTypes={[loaderData.selectedType]}
        partnerId={loaderData.partnerId}
        lockedListingTypeId={loaderData.selectedType.id}
        cancellationPolicies={loaderData.cancellationPolicies}
        minimumDepositPercent={loaderData.minimumDepositPercent}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
