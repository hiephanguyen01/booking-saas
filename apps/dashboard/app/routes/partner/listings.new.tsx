import { data, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { createListingInputSchema, type ListingTypeResponse } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/listings.new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './lib.server';
import { PageHeader } from './components/page-header';
import { ListingForm } from './components/listing-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng mới · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) {
    throw new Response('Không có quyền tạo tin đăng.', { status: 403 });
  }
  const types = await apiGet<ListingTypeResponse[]>('/partner/listing-types', auth);
  return { listingTypes: types.data ?? [], partnerId: membership.partnerId };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) {
    return data({ error: 'Không có quyền tạo tin đăng.', fieldErrors: null }, { status: 403 });
  }
  const parsed = createListingInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPost('/partner/listings', parsed.data, auth);
  if (!res.ok) {
    return data({ error: res.error ?? 'Tạo tin đăng không thành công.', fieldErrors: res.errors ?? null }, { status: 400 });
  }
  return redirect('/partner/listings');
}

export default function NewListingPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/partner/listings">
            <ArrowLeft className="size-4" aria-hidden /> Tin đăng
          </Link>
        </Button>
        <PageHeader title="Tin đăng mới" description="Tạo tin đăng mới; sau khi tạo hãy gửi duyệt để hiển thị." />
      </div>
      <ListingForm
        listingTypes={loaderData.listingTypes}
        partnerId={loaderData.partnerId}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
