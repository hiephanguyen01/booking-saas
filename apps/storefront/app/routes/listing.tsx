import { Form, useSearchParams } from 'react-router';
import type { BookingMode, PublicListingDetailResponse, QuoteResponse } from '@booking/shared';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import { Separator } from '@booking/ui/components/ui/separator';
import type { Route } from './+types/listing';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { formatVnd } from '../lib/ui';

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.listing?.title ?? 'Listing' }];
}

/** datetime-local ('YYYY-MM-DDTHH:MM') is entered in the tenant zone (ICT, +07:00). */
function toUtcIso(local: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00+07:00` : local;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const sp = new URL(request.url).searchParams;
  const listing = await fetchListing(request, params.listingSlug);

  let quote: QuoteResponse | null = null;
  const mode = sp.get('mode');
  const from = sp.get('from');
  const to = sp.get('to');
  if (listing && mode && from && to) {
    const query = new URLSearchParams({
      mode,
      from: toUtcIso(from),
      to: toUtcIso(to),
      quantity: sp.get('quantity') || '1',
    });
    quote = await fetchQuote(request, params.listingSlug, query);
  }
  return { listing, quote };
}

/** Cheapest configured base price across modes (for the "from" price). */
function fromPrice(modeConfig: Record<string, unknown>): string | null {
  const prices: number[] = [];
  for (const cfg of Object.values(modeConfig)) {
    if (cfg && typeof cfg === 'object') {
      const c = cfg as Record<string, unknown>;
      for (const key of ['basePrice', 'basePricePerNight']) {
        const n = Number(c[key]);
        if (Number.isFinite(n) && n > 0) prices.push(n);
      }
    }
  }
  return prices.length > 0 ? String(Math.min(...prices)) : null;
}

export default function ListingDetail({ loaderData, params }: Route.ComponentProps) {
  const { listing, quote } = loaderData;
  const [sp] = useSearchParams();

  if (!listing) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center text-gray-500">
        Không tìm thấy “{params.listingSlug}”.
      </div>
    );
  }

  const attrs = Object.entries(listing.attributes).filter(
    ([, v]) => v !== null && v !== '' && typeof v !== 'boolean',
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{listing.title}</h1>
        {attrs.length > 0 ? (
          <p className="mt-1 text-sm text-(--sf-muted)">
            {attrs.map(([, v]) => String(v)).join(' · ')}
          </p>
        ) : null}
        <TrustSignals trust={listing.trust} />
      </div>

      <Gallery photos={listing.photos} title={listing.title} />

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          {listing.description ? (
            <p className="text-[15px] leading-relaxed text-gray-700">{listing.description}</p>
          ) : null}
          {attrs.length > 0 ? (
            <>
              <Separator className="my-6" />
              <h2 className="mb-3 text-lg font-semibold">Thông tin</h2>
              <div className="flex flex-wrap gap-2">
                {attrs.map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="rounded-full px-3 py-1 font-normal">
                    {key}: {String(value)}
                  </Badge>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div>
          <QuoteCard listing={listing} quote={quote} searchParams={sp} />
        </div>
      </div>
    </div>
  );
}

/**
 * Trust signals (§16.1) — shown before ratings exist, all from data on hand.
 * Contact details are never here: they are revealed only after a booking is
 * confirmed (§7.3 anti-disintermediation).
 */
function TrustSignals({ trust }: { trust: PublicListingDetailResponse['trust'] }) {
  const since = activeSinceLabel(trust.partnerActiveSince);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">Cung cấp bởi {trust.partnerName}</span>
      {trust.identityVerified ? (
        <Badge className="gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-white hover:bg-emerald-600">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z" />
          </svg>
          Đã xác minh danh tính
        </Badge>
      ) : null}
      {since ? (
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-normal">
          Hoạt động từ {since}
        </Badge>
      ) : null}
      {trust.completedBookings > 0 ? (
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-normal">
          {trust.completedBookings} lượt đặt hoàn tất
        </Badge>
      ) : null}
    </div>
  );
}

/** "thg 7/2026" from an ISO date, without pulling in a locale lib. */
function activeSinceLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `thg ${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-3xl bg-gray-100 text-gray-400">
        {title}
      </div>
    );
  }
  const [cover, ...rest] = photos;
  return (
    <div className="overflow-hidden rounded-3xl">
      <div className="grid gap-2 md:h-[440px] md:grid-cols-4 md:grid-rows-2">
        <img
          src={cover}
          alt={title}
          className="aspect-[4/3] w-full object-cover md:col-span-2 md:row-span-2 md:aspect-auto md:h-full"
        />
        {rest.slice(0, 4).map((src, i) => (
          <img key={i} src={src} alt="" className="hidden h-full w-full object-cover md:block" />
        ))}
      </div>
    </div>
  );
}

function QuoteCard({
  listing,
  quote,
  searchParams,
}: {
  listing: PublicListingDetailResponse;
  quote: QuoteResponse | null;
  searchParams: URLSearchParams;
}) {
  const from = formatVnd(fromPrice(listing.modeConfig));
  return (
    <Card className="sticky top-28 rounded-2xl border-black/10 shadow-xl">
      <CardContent className="p-6">
        <div className="mb-5 flex items-baseline gap-2">
          {quote ? (
            <>
              <span className="text-2xl font-bold">{formatVnd(quote.subtotal)}</span>
              <span className="text-sm text-(--sf-muted)">tổng tạm tính</span>
            </>
          ) : from ? (
            <>
              <span className="text-2xl font-bold">{from}</span>
              <span className="text-sm text-(--sf-muted)">trở lên</span>
            </>
          ) : (
            <span className="text-lg font-semibold">Chọn lịch để xem giá</span>
          )}
        </div>

        <Form method="get" className="space-y-3">
          <Field label="Hình thức">
            <NativeSelect name="mode" defaultValue={searchParams.get('mode') ?? listing.bookingModes[0]}>
              {listing.bookingModes.map((mode: BookingMode) => (
                <NativeSelectOption key={mode} value={mode}>
                  {mode}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu">
              <Input type="datetime-local" name="from" defaultValue={searchParams.get('from') ?? ''} />
            </Field>
            <Field label="Kết thúc">
              <Input type="datetime-local" name="to" defaultValue={searchParams.get('to') ?? ''} />
            </Field>
          </div>
          <Field label="Số lượng">
            <Input
              type="number"
              name="quantity"
              min={1}
              defaultValue={searchParams.get('quantity') ?? '1'}
              className="w-28"
            />
          </Field>
          <Button type="submit" className="h-11 w-full text-base">
            Xem giá
          </Button>
        </Form>

        {quote ? (
          <>
            <Separator className="my-4" />
            <Breakdown quote={quote} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</span>
      {children}
    </label>
  );
}

function Breakdown({ quote }: { quote: QuoteResponse }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {quote.lineItems.map((line, i) => (
        <div key={i} className="flex justify-between text-gray-600">
          <dt>
            {line.label}
            {line.block ? ' (gói)' : ''}
          </dt>
          <dd>{formatVnd(line.amount)}</dd>
        </div>
      ))}
      <Separator className="my-2" />
      <div className="flex justify-between font-semibold">
        <dt>Tạm tính</dt>
        <dd>{formatVnd(quote.subtotal)}</dd>
      </div>
      <div className="flex justify-between text-gray-500">
        <dt>Đặt cọc</dt>
        <dd>{formatVnd(quote.depositAmount)}</dd>
      </div>
      {quote.securityDeposit !== '0' ? (
        <div className="flex justify-between text-gray-500">
          <dt>Cọc thiết bị</dt>
          <dd>{formatVnd(quote.securityDeposit)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
