import { useEffect, useRef, useState } from 'react';
import { data } from 'react-router';
import { Ban } from 'lucide-react';
import {
  createBlockExceptionInputSchema,
  type ListingResponse,
  type PartnerCalendarBookingResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/calendar';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { resolveListingResource } from '~/features/partner/server/partner-calendar.server';
import { MasterCalendar } from '~/features/partner/components/master-calendar';
import { CalendarToolbar } from '~/features/partner/components/calendar/calendar-toolbar';
import {
  QuickBlockDialog,
  type BlockableListing,
} from '~/features/partner/components/calendar/quick-block-dialog';
import { PageHeader } from '~/components/page-header';
import { ErrorBanner } from '~/components/action-feedback';
import { dayKey } from '~/lib/format';
import { addDays, mondayOf, parseDay, startOfDayUtc, todayString, toDayString, weekDays } from '~/lib/calendar-dates';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Lịch tổng · Đối tác · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.bookings.read');

  const view = url.searchParams.get('view') === 'day' ? 'day' : 'week';
  const today = todayString();
  const anchorParam = url.searchParams.get(view === 'day' ? 'day' : 'week');
  const anchor = anchorParam && /^\d{4}-\d{2}-\d{2}$/.test(anchorParam) ? anchorParam : today;

  const days = view === 'day' ? [anchor] : weekDays(mondayOf(parseDay(anchor))).map(toDayString);
  const from = startOfDayUtc(days[0]);
  const to = startOfDayUtc(toDayString(addDays(parseDay(days[days.length - 1]), 1)));

  const canBlock = can('partner.availability.manage');
  const canReadListings = can('partner.listings.read');

  const [feed, listingsRes] = await Promise.all([
    apiGet<PartnerCalendarBookingResponse[]>(
      `/partner/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      auth,
    ),
    canReadListings
      ? apiGet<{ items: ListingResponse[] }>('/partner/listings?page=1&pageSize=100', auth)
      : Promise.resolve(null),
  ]);

  const bookings = feed.ok && feed.data ? feed.data : [];
  const listings: BlockableListing[] =
    listingsRes && listingsRes.ok && listingsRes.data
      ? listingsRes.data.items.map((l) => ({ id: l.id, title: l.title, resourceId: l.resourceId }))
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
  const { auth, can } = await requirePartner(request);
  if (!can('partner.availability.manage')) {
    return data({ ok: false as const, error: 'Không có quyền chặn lịch.' }, { status: 403 });
  }

  const parsed = createBlockExceptionInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data(
      {
        ok: false as const,
        error: 'Vui lòng chọn tài nguyên và ngày hợp lệ.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const resourceId = await resolveListingResource(auth, parsed.data.listingId);
  if (!resourceId) {
    return data({ ok: false as const, error: 'Không tìm thấy tài nguyên.' }, { status: 400 });
  }

  // The picker's Date is an instant; format it back to the VN calendar day the
  // partner selected before sending the block body.
  const date = dayKey(parsed.data.date.toISOString());
  const res = await apiPost(
    `/partner/resources/${resourceId}/availability-exceptions`,
    { date, type: 'closed', ...(parsed.data.reason ? { reason: parsed.data.reason } : {}) },
    auth,
  );
  if (!res.ok) {
    return data(
      { ok: false as const, error: res.error ?? 'Không chặn được lịch.' },
      { status: 400 },
    );
  }
  return data({ ok: true as const, error: null });
}

export default function PartnerCalendarPage({ loaderData, actionData }: Route.ComponentProps) {
  const { view, days, anchor, today, bookings, listings, listingTypes, canBlock, loadError } =
    loaderData;
  const [blockDay, setBlockDay] = useState<string | null>(null);

  // Close the dialog once a block succeeds. Track the handled result by reference
  // so re-opening the dialog (same stale `actionData`) does not auto-close.
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (actionData?.ok && handled.current !== actionData) {
      handled.current = actionData;
      setBlockDay(null);
    }
  }, [actionData]);

  const blockError = actionData && !actionData.ok ? actionData.error : null;
  const blockFieldErrors =
    actionData && !actionData.ok && 'fieldErrors' in actionData
      ? (actionData.fieldErrors as Partial<Record<string, string[] | undefined>>)
      : null;

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

      <CalendarToolbar view={view === 'day' ? 'day' : 'week'} anchor={anchor} today={today} days={days} />

      <ErrorBanner error={loadError} />

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
          serverError={blockError}
          fieldErrors={blockFieldErrors}
          onOpenChange={(open) => !open && setBlockDay(null)}
        />
      ) : null}
    </div>
  );
}
