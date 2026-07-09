import { Form, Link, redirect, useNavigation } from 'react-router';
import type { ListingResponse, ListingReviewResponse } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { Separator } from '@booking/ui/components/ui/separator';
import { ArrowLeft, Check, CircleAlert, EyeOff, ShieldCheck, X } from 'lucide-react';
import type { Route } from './+types/review';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { PageHeader } from '../components/page';
import { ListingStatusBadge } from '../components/status';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Kiểm duyệt listing · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const [listingRes, reviewRes] = await Promise.all([
    apiGet<ListingResponse>(`/tenant/listings/${params.listingId}`, auth),
    apiGet<ListingReviewResponse>(`/tenant/listings/${params.listingId}/review`, auth),
  ]);
  if (!reviewRes.ok || !reviewRes.data) {
    throw new Response(reviewRes.error ?? 'Không tìm thấy listing', { status: reviewRes.status });
  }
  return {
    listing: listingRes.ok ? listingRes.data : null,
    review: reviewRes.data,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const id = params.listingId;

  let res;
  if (intent === 'publish') {
    res = await apiPost(`/tenant/listings/${id}/publish`, {}, auth);
  } else if (intent === 'republish') {
    res = await apiPost(`/tenant/listings/${id}/republish`, {}, auth);
  } else if (intent === 'hide') {
    const reason = String(form.get('reason') ?? '').trim();
    res = await apiPost(`/tenant/listings/${id}/hide`, reason ? { reason } : {}, auth);
  } else {
    return { error: 'Hành động không hợp lệ.' };
  }

  if (!res.ok) return { error: res.error ?? 'Thao tác thất bại.' };
  return redirect('/tenant/listings');
}

export default function ReviewListing({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, review } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  const hasContactLeak = review.contactFlags.length > 0;
  const canPublish = review.checklistPassed && !hasContactLeak;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/tenant/listings">
            <ArrowLeft className="size-4" /> Danh sách
          </Link>
        </Button>
      </div>

      <PageHeader
        title={listing?.title ?? 'Kiểm duyệt listing'}
        description={listing ? `/${listing.slug}` : undefined}
        actions={<ListingStatusBadge status={review.status} />}
      />

      {actionData && 'error' in actionData && actionData.error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Không thực hiện được</AlertTitle>
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Checklist duyệt</CardTitle>
            <CardDescription>
              {review.checklistPassed
                ? 'Tất cả tiêu chí bắt buộc đã đạt.'
                : 'Còn tiêu chí chưa đạt — không thể xuất bản.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {review.checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-3 py-3">
                  <span
                    className={
                      item.passed
                        ? 'flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'flex size-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                    }
                  >
                    {item.passed ? <Check className="size-4" /> : <X className="size-4" />}
                  </span>
                  <span className="text-sm">{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Quét thông tin liên hệ
            </CardTitle>
            <CardDescription>Chống lách sàn (§7.3)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasContactLeak ? (
              <>
                <Alert variant="destructive">
                  <CircleAlert className="size-4" />
                  <AlertTitle>Phát hiện {review.contactFlags.length} dấu hiệu</AlertTitle>
                  <AlertDescription>Xuất bản bị chặn cho tới khi được gỡ bỏ.</AlertDescription>
                </Alert>
                <ul className="space-y-2">
                  {review.contactFlags.map((flag, i) => (
                    <li key={i} className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs dark:border-rose-500/30 dark:bg-rose-500/10">
                      <span className="font-medium uppercase text-rose-700 dark:text-rose-300">{flag.type}</span>{' '}
                      trong <span className="font-medium">{flag.field}</span>: “{flag.match}”
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Check className="size-4" /> Không phát hiện thông tin liên hệ bị lộ.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hành động kiểm duyệt</CardTitle>
          <CardDescription>Quyết định sẽ được ghi vào nhật ký kiểm duyệt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {review.status !== 'published' ? (
              <Form method="post">
                <input type="hidden" name="intent" value="publish" />
                <Button type="submit" disabled={busy || !canPublish}>
                  <Check className="size-4" /> Duyệt & xuất bản
                </Button>
              </Form>
            ) : (
              <Form method="post">
                <input type="hidden" name="intent" value="republish" />
                <Button type="submit" variant="outline" disabled={busy}>
                  <Check className="size-4" /> Hiển thị lại
                </Button>
              </Form>
            )}
          </div>

          {!canPublish && review.status !== 'published' ? (
            <p className="text-xs text-muted-foreground">
              Nút xuất bản bị vô hiệu hoá vì checklist chưa đạt hoặc listing còn lộ thông tin liên hệ.
            </p>
          ) : null}

          <Separator />

          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="hide" />
            <div className="space-y-1.5">
              <label htmlFor="reason" className="text-sm font-medium">
                Lý do ẩn / từ chối (tuỳ chọn)
              </label>
              <Textarea
                id="reason"
                name="reason"
                rows={3}
                placeholder="VD: Ảnh không rõ, thiếu mô tả, lộ số điện thoại…"
              />
            </div>
            <Button type="submit" variant="destructive" disabled={busy}>
              <EyeOff className="size-4" /> Ẩn listing
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
