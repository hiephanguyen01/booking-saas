import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { data } from 'react-router';
import { Ban, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  createBlockExceptionInputSchema,
  type CreateBlockExceptionInput,
  type ListingResponse,
  type PartnerCalendarBookingResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Route } from './+types/calendar';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { MasterCalendar } from './components/master-calendar';
import { PageHeader } from '~/components/page-header';
import { dayKey, formatDate } from '~/lib/format';
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

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.bookings.read')) {
    throw new Response('Không có quyền xem lịch đặt.', { status: 403 });
  }

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
    apiGet<PartnerCalendarBookingResponse[]>(
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

  // Map the chosen listing to its real resource id server-side. Re-fetching the
  // partner-scoped listing feed also confirms the listing belongs to this partner
  // (no cross-partner block).
  const listingsRes = await apiGet<ListingResponse[]>('/partner/listings', auth);
  const listing =
    listingsRes.ok && listingsRes.data
      ? listingsRes.data.find((l) => l.id === parsed.data.listingId)
      : undefined;
  if (!listing?.resourceId) {
    return data({ ok: false as const, error: 'Không tìm thấy tài nguyên.' }, { status: 400 });
  }

  // The picker's Date is an instant; format it back to the VN calendar day the
  // partner selected before sending the block body.
  const date = dayKey(parsed.data.date.toISOString());
  const res = await apiPost(
    `/partner/resources/${listing.resourceId}/availability-exceptions`,
    { date, type: 'closed', ...(parsed.data.reason ? { reason: parsed.data.reason } : {}) },
    auth,
  );
  if (!res.ok) {
    return data({ ok: false as const, error: res.error ?? 'Không chặn được lịch.' }, { status: 400 });
  }
  return data({ ok: true as const, error: null });
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

export default function PartnerCalendarPage({ loaderData, actionData }: Route.ComponentProps) {
  const { view, days, anchor, today, bookings, listings, listingTypes, canBlock, loadError } =
    loaderData;
  const link = useCalendarLink();
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
                'rounded px-3 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
          serverError={blockError}
          fieldErrors={blockFieldErrors}
          onOpenChange={(open) => !open && setBlockDay(null)}
        />
      ) : null}
    </div>
  );
}

function QuickBlockDialog({
  day,
  listings,
  serverError,
  fieldErrors,
  onOpenChange,
}: {
  day: string | null;
  listings: BlockableListing[];
  serverError: string | null;
  fieldErrors: Partial<Record<string, string[] | undefined>> | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Note: the select stores a *listing* id; the route action maps it to the
  // listing's real resource id before submitting the block.
  const fields: FieldConfig<CreateBlockExceptionInput>[] = [
    {
      name: 'listingId',
      type: 'select',
      label: 'Tài nguyên',
      placeholder: 'Chọn tài nguyên',
      options: listings.map((l) => ({ value: l.id, label: l.title })),
    },
    { name: 'date', type: 'date', label: 'Ngày', placeholder: 'Chọn ngày' },
    { name: 'reason', type: 'textarea', label: 'Lý do (tuỳ chọn)', placeholder: 'Bảo trì, nghỉ lễ…', rows: 2 },
  ];

  return (
    <Dialog open={day !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chặn lịch</DialogTitle>
          <DialogDescription>
            Đánh dấu một ngày là đóng cho một tài nguyên. Ngày bị chặn sẽ không còn hiển thị để khách đặt.
          </DialogDescription>
        </DialogHeader>
        <GenericForm
          key={day ?? 'closed'}
          schema={createBlockExceptionInputSchema}
          fields={fields}
          submitLabel="Chặn ngày này"
          serverError={serverError}
          fieldErrors={fieldErrors}
          defaultValues={{
            listingId: listings[0]?.id ?? '',
            date: day ? parseDay(day) : undefined,
          }}
        >
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
        </GenericForm>
      </DialogContent>
    </Dialog>
  );
}
