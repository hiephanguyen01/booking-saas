import { Form, useSearchParams } from 'react-router';
import type { BookingMode, QuoteResponse } from '@booking/shared';
import type { Route } from './+types/listing';
import { fetchListing, fetchQuote } from '../lib/catalog.server';

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

const vnd = (amount: string): string => `${Number(amount).toLocaleString('vi-VN')}₫`;

export default function ListingDetail({ loaderData, params }: Route.ComponentProps) {
  const { listing, quote } = loaderData;
  const [sp] = useSearchParams();

  if (!listing) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center text-gray-500">
        Không tìm thấy “{params.listingSlug}”.
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-bold text-(--sf-primary)">{listing.title}</h1>
        {listing.description ? <p className="mt-2 text-gray-600">{listing.description}</p> : null}
        {listing.photos.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {listing.photos.map((src) => (
              <img key={src} src={src} alt="" className="aspect-video w-full rounded-lg object-cover" />
            ))}
          </div>
        ) : null}
        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
          {Object.entries(listing.attributes).map(([key, value]) => (
            <div key={key}>
              <dt className="font-medium">{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <aside className="rounded-xl border border-black/10 p-5">
        <h2 className="mb-3 font-semibold">Báo giá</h2>
        <QuoteForm bookingModes={listing.bookingModes} searchParams={sp} />
        {quote ? <QuoteResult quote={quote} /> : null}
      </aside>
    </div>
  );
}

function QuoteForm({
  bookingModes,
  searchParams,
}: {
  bookingModes: BookingMode[];
  searchParams: URLSearchParams;
}) {
  const inputClass = 'w-full rounded-md border border-black/15 px-2 py-1 text-sm';
  return (
    <Form method="get" className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Hình thức</span>
        <select name="mode" defaultValue={searchParams.get('mode') ?? bookingModes[0]} className={inputClass}>
          {bookingModes.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Bắt đầu</span>
        <input type="datetime-local" name="from" defaultValue={searchParams.get('from') ?? ''} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Kết thúc</span>
        <input type="datetime-local" name="to" defaultValue={searchParams.get('to') ?? ''} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Số lượng</span>
        <input type="number" name="quantity" min={1} defaultValue={searchParams.get('quantity') ?? '1'} className={inputClass} />
      </label>
      <button type="submit" className="w-full rounded-md bg-(--sf-primary) px-3 py-2 text-sm text-white">
        Xem giá
      </button>
    </Form>
  );
}

function QuoteResult({ quote }: { quote: QuoteResponse }) {
  return (
    <div className="mt-4 border-t border-black/10 pt-4 text-sm">
      <ul className="space-y-1 text-gray-600">
        {quote.lineItems.map((line, i) => (
          <li key={i} className="flex justify-between">
            <span>
              {line.label} × {line.quantity}
              {line.block ? ' (bundle)' : ''}
              {line.appliedRuleId ? ' ★' : ''}
            </span>
            <span>{vnd(line.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-semibold">
        <span>Tạm tính</span>
        <span className="text-(--sf-accent)">{vnd(quote.subtotal)}</span>
      </div>
      <div className="mt-1 flex justify-between text-gray-500">
        <span>Đặt cọc</span>
        <span>{vnd(quote.depositAmount)}</span>
      </div>
      {quote.securityDeposit !== '0' ? (
        <div className="mt-1 flex justify-between text-gray-500">
          <span>Tiền cọc thiết bị</span>
          <span>{vnd(quote.securityDeposit)}</span>
        </div>
      ) : null}
    </div>
  );
}
