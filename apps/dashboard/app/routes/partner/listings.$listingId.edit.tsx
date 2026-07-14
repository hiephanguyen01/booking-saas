import { data, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import {
  updateListingInputSchema,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/listings.$listingId.edit';
import { apiGet, apiPatch } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from './components/page-header';
import { ListingForm } from './components/listing-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa tin đăng · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) {
    throw new Response('Không có quyền sửa tin đăng.', { status: 403 });
  }
  const [listingRes, typesRes] = await Promise.all([
    apiGet<ListingResponse>(`/partner/listings/${params.listingId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  if (!listingRes.ok || !listingRes.data) {
    throw new Response('Không tìm thấy tin đăng.', { status: listingRes.status === 403 ? 403 : 404 });
  }
  return { listing: listingRes.data, listingTypes: typesRes.data ?? [], partnerId: membership.partnerId };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) {
    return data({ error: 'Không có quyền sửa tin đăng.', fieldErrors: null }, { status: 403 });
  }
  const parsed = updateListingInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPatch(`/partner/listings/${params.listingId}`, parsed.data, auth);
  if (!res.ok) {
    return data({ error: res.error ?? 'Lưu không thành công.', fieldErrors: res.errors ?? null }, { status: 400 });
  }
  return redirect('/partner/listings');
}

export default function EditListingPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/partner/listings">
            <ArrowLeft className="size-4" aria-hidden /> Tin đăng
          </Link>
        </Button>
        <PageHeader title="Sửa tin đăng" description={loaderData.listing.title} />
      </div>
      <ListingForm
        listingTypes={loaderData.listingTypes}
        partnerId={loaderData.partnerId}
        listing={loaderData.listing}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
