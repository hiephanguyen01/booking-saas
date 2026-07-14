import { useState } from 'react';
import { Form, Link, redirect, useNavigation } from 'react-router';
import { ArrowLeft, Check, CircleAlert, EyeOff } from 'lucide-react';
import type { ListingGroupDetailResponse } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@booking/ui/components/ui/field';
import type { Route } from './+types/review';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { PageHeader } from '../components/page';
import { ListingStatusBadge } from '../components/status';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.read');
  const res = await apiGet<ListingGroupDetailResponse>(
    `/tenant/listing-groups/${params.groupId}/detail`,
    auth,
  );
  if (!res.ok || !res.data) throw new Response('Không tìm thấy bài đăng.', { status: res.status });
  return { group: res.data };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (!['publish', 'hide', 'republish'].includes(intent))
    return { error: 'Hành động không hợp lệ.' };
  const force = form.get('force') === '1';
  const body = intent === 'publish' ? { force } : {};
  const res = await apiPost(`/tenant/listing-groups/${params.groupId}/${intent}`, body, auth);
  if (!res.ok) {
    return {
      error:
        res.code === 'LISTING_HAS_CONTACT_INFO'
          ? 'Bài đăng có thông tin liên hệ. Hãy kiểm tra nội dung hoặc xác nhận duyệt bất chấp cảnh báo.'
          : (res.error ?? 'Thao tác không thành công.'),
      code: res.code,
    };
  }
  return redirect('/tenant/listing-groups');
}

export default function ListingGroupReviewPage({ loaderData, actionData }: Route.ComponentProps) {
  const { group } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const contactInfoBlocked = actionData?.code === 'LISTING_HAS_CONTACT_INFO';
  const [forcePublish, setForcePublish] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/tenant/listing-groups">
            <ArrowLeft data-icon="inline-start" /> Bài đăng
          </Link>
        </Button>
      </div>
      <PageHeader
        title={group.title}
        description={`${group.listingCount} ${group.itemLabel}`}
        actions={<ListingStatusBadge status={group.status} />}
      />
      {actionData?.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Chưa thể xuất bản</AlertTitle>
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
          <CardDescription>Album và nội dung dùng chung cho toàn bộ bài đăng.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {group.photos.length ? (
            <div className="flex flex-wrap gap-3">
              {group.photos.map((photo) => (
                <img key={photo} src={photo} alt="" className="size-28 rounded-md object-cover" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có ảnh.</p>
          )}
          <p className="whitespace-pre-wrap text-sm">{group.description || 'Chưa có mô tả.'}</p>
          {group.address || group.workingArea ? (
            <p className="text-sm text-muted-foreground">{group.address || group.workingArea}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {group.amenities.map((amenity) => (
              <Badge key={amenity} variant="secondary">
                {amenity}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{group.itemLabel}</CardTitle>
          <CardDescription>
            {group.readyListingCount}/{group.listingCount} hạng mục đạt mức hoàn thiện cơ bản.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {group.listings.map((listing) => (
            <Card key={listing.id}>
              <CardHeader>
                <CardTitle>{listing.title}</CardTitle>
                <CardDescription>{listing.bookingModes.join(' · ')}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {listing.description || 'Chưa có mô tả.'}
                </p>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Hành động kiểm duyệt</CardTitle>
          <CardDescription>Hành động áp dụng cho bài đăng và toàn bộ hạng mục.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col items-start gap-4">
            {group.status === 'pending_review' && contactInfoBlocked ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="force-publish"
                  checked={forcePublish}
                  onCheckedChange={(checked) => setForcePublish(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="force-publish">Duyệt bất chấp cảnh báo</FieldLabel>
                  <FieldDescription>
                    Bài đăng vẫn được xuất bản dù còn thông tin liên hệ. Quyết định ghi đè này sẽ
                    được lưu trong nhật ký kiểm duyệt.
                  </FieldDescription>
                </FieldContent>
              </Field>
            ) : null}
            <input type="hidden" name="force" value={forcePublish ? '1' : '0'} />
            <div className="flex gap-3">
              {group.status === 'pending_review' ? (
                <Button
                  name="intent"
                  value="publish"
                  disabled={busy || (contactInfoBlocked && !forcePublish)}
                >
                  <Check data-icon="inline-start" />{' '}
                  {forcePublish ? 'Vẫn duyệt & xuất bản' : 'Duyệt & xuất bản'}
                </Button>
              ) : null}
              {group.status === 'published' ? (
                <Button name="intent" value="hide" variant="destructive" disabled={busy}>
                  <EyeOff data-icon="inline-start" /> Ẩn bài đăng
                </Button>
              ) : null}
              {group.status === 'archived' ? (
                <Button name="intent" value="republish" disabled={busy}>
                  Mở lại
                </Button>
              ) : null}
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
