import { useEffect, useState } from 'react';
import { Link, useFetcher, useSearchParams } from 'react-router';
import { data } from 'react-router';
import { Ban, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ListingResponse } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import type { Route } from './+types/calendar';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './lib.server';
import type { PartnerCalendarBooking } from './types';
import { MasterCalendar } from './components/master-calendar';
import { PageHeader } from './components/page-header';
import { formatDate } from './components/format';
import {
  addDays,
  mondayOf,
  parseDay,
  startOfDayUtc,
  todayString,
  toDayString,
  weekDays,
} from './components/calendar-dates';

interface BlockableListing {
  id: string;
  title: string;
  resourceId: string;
}

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Lịch tổng · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.bookings.read')) {
    throw new Response('Không có quyền xem lịch đặt.', { status: 403 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get('view') === 'day' ? 'day' : 'week';
  const today = todayString();
  const anchorParam = url.searchParams.get(view === 'day' ? 'day' : 'week');
  const anchor = anchorParam && /^\d{4}-\d{2}-\d{2}$/.test(anchorParam) ? anchorParam : today;

  const days =
    view === 'day' ? [anchor] : weekDays(mondayOf(parseDay(anchor))).map(toDayString);
  const from = startOfDayUtc(days[0]);
  const to = startOfDayUtc(toDayString(addDays(parseDay(days[days.length - 1]), 1)));

  const canBlock = canPartner(membership, 'partner.availability.manage');
  const canReadListings = canPartner(membership, 'partner.listings.read');

  const [feed, listingsRes] = await Promise.all([
    apiGet<PartnerCalendarBooking[]>(
      `/partner/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      auth,
    ),
    canReadListings
      ? apiGet<ListingResponse[]>('/partner/listings', auth)
      : Promise.resolve(null),
  ]);

  const bookings = feed.ok && feed.data ? feed.data : [];
  const listings: BlockableListing[] =
    listingsRes && listingsRes.ok && listingsRes.data
      ? listingsRes.data.map((l) => ({ id: l.id, title: l.title, resourceId: l.resourceId }))
      : [];

  // Listing types for the client-side filter - derived from the feed so it works
  // even without listings.read.
  const typeMap = new Map<string, string>();
  for (const b of bookings) typeMap.set(b.listingTypeId, b.listingTypeName);
  const listingTypes = [...typeMap].map(([id, name]) => ({ id, name }));

  return {
    view,
    days,
    anchor,
    today,
    bookings,
    listings,
    listingTypes,
    canBlock,
    loadError: feed.ok ? null : (feed.error ?? 'Không tải được lịch đặt.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.availability.manage')) {
    return data({ ok: false, error: 'Không có quyền chặn lịch.' }, { status: 403 });
  }
  const form = await request.formData();
  const resourceId = String(form.get('resourceId') ?? '');
  const date = String(form.get('date') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!resourceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return data({ ok: false, error: 'Vui lòng chọn tài nguyên và ngày hợp lệ.' }, { status: 400 });
  }

  const res = await apiPost(
    `/partner/resources/${resourceId}/availability-exceptions`,
    { date, type: 'closed', ...(reason ? { reason } : {}) },
    auth,
  );
  if (!res.ok) {
    return data({ ok: false, error: res.error ?? 'Không chặn được lịch.' }, { status: 400 });
  }
  return data({ ok: true, error: null });
}

/** Build a link to the same route with an updated query param set. */
function useCalendarLink() {
  const [params] = useSearchParams();
  return (patch: Record<string, string>): string => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    return `?${next.toString()}`;
  };
}

export default function PartnerCalendarPage({ loaderData }: Route.ComponentProps) {
  const { view, days, anchor, today, bookings, listings, listingTypes, canBlock, loadError } =
    loaderData;
  const link = useCalendarLink();
  const [blockDay, setBlockDay] = useState<string | null>(null);

  const rangeLabel =
    view === 'day'
      ? formatDate(startOfDayUtc(days[0]))
      : `${formatDate(startOfDayUtc(days[0]))} - ${formatDate(startOfDayUtc(days[6]))}`;

  const monday = mondayOf(parseDay(anchor));
  const prevAnchor = toDayString(addDays(view === 'day' ? parseDay(anchor) : monday, view === 'day' ? -1 : -7));
  const nextAnchor = toDayString(addDays(view === 'day' ? parseDay(anchor) : monday, view === 'day' ? 1 : 7));
  const anchorKey = view === 'day' ? 'day' : 'week';

  const openBlock = (day: string): void => {
    if (canBlock && listings.length > 0) setBlockDay(day);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lịch tổng"
        description="Toàn bộ lượt đặt trên các tài nguyên của bạn - theo tuần hoặc theo ngày."
        actions={
          canBlock ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBlock(view === 'day' ? days[0] : today)}
              disabled={listings.length === 0}
            >
              <Ban className="size-4" aria-hidden /> Chặn lịch
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon-sm" aria-label="Kỳ trước">
            <Link to={link({ [anchorKey]: prevAnchor })} prefetch="intent">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={link({ [anchorKey]: today })} prefetch="intent">
              Hôm nay
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm" aria-label="Kỳ sau">
            <Link to={link({ [anchorKey]: nextAnchor })} prefetch="intent">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <span className="ml-2 flex items-center gap-2 text-sm font-medium tabular-nums">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            {rangeLabel}
          </span>
        </div>

        <div className="inline-flex rounded-md border p-0.5">
          {(['week', 'day'] as const).map((v) => (
            <Link
              key={v}
              to={link({ view: v, ...(v === 'day' ? { day: view === 'day' ? anchor : today } : { week: view === 'week' ? anchor : today }) })}
              prefetch="intent"
              className={cn(
                'rounded px-3 py-1 text-sm font-medium transition',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'week' ? 'Tuần' : 'Ngày'}
            </Link>
          ))}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      <MasterCalendar
        view={view === 'day' ? 'day' : 'week'}
        days={days}
        bookings={bookings}
        listingTypes={listingTypes}
        today={today}
        onQuickBlock={openBlock}
      />

      {canBlock ? (
        <QuickBlockDialog
          day={blockDay}
          listings={listings}
          onOpenChange={(open) => !open && setBlockDay(null)}
        />
      ) : null}
    </div>
  );
}

function QuickBlockDialog({
  day,
  listings,
  onOpenChange,
}: {
  day: string | null;
  listings: BlockableListing[];
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const [resourceId, setResourceId] = useState<string>(listings[0]?.id ?? '');

  // Close the dialog once the block succeeds.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) onOpenChange(false);
  }, [fetcher.state, fetcher.data, onOpenChange]);

  const selected = listings.find((l) => l.id === resourceId) ?? listings[0];
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  return (
    <Dialog open={day !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chặn lịch</DialogTitle>
          <DialogDescription>
            Đánh dấu một ngày là đóng cho một tài nguyên. Ngày bị chặn sẽ không còn hiển thị để khách đặt.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="space-y-4">
          <input type="hidden" name="resourceId" value={selected?.resourceId ?? ''} />
          <div className="space-y-2">
            <Label htmlFor="block-listing">Tài nguyên</Label>
            <Select value={resourceId} onValueChange={setResourceId}>
              <SelectTrigger id="block-listing" className="w-full">
                <SelectValue placeholder="Chọn tài nguyên" />
              </SelectTrigger>
              <SelectContent>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-date">Ngày</Label>
            <Input id="block-date" name="date" type="date" defaultValue={day ?? ''} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Lý do (tuỳ chọn)</Label>
            <Textarea id="block-reason" name="reason" rows={2} placeholder="Bảo trì, nghỉ lễ…" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={fetcher.state !== 'idle' || !selected}>
              {fetcher.state !== 'idle' ? 'Đang chặn…' : 'Chặn ngày này'}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
