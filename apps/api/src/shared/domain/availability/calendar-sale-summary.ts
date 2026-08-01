import type {
  AvailabilityCalendarResponse,
  AvailabilityCalendarSale,
  AvailabilityResponse,
} from '@booking/contracts';
import { saleDiscountPercent } from '../pricing/sale-campaign';

/** Project detailed availability into the compact month-calendar response. */
export function summarizeAvailabilityCalendar(
  detail: Extract<AvailabilityResponse, { mode: 'hourly' | 'daily' }>,
): AvailabilityCalendarResponse {
  if (detail.mode === 'hourly') {
    return {
      view: 'calendar',
      mode: 'hourly',
      timezone: detail.timezone,
      days: detail.days.map((day) => {
        const open = day.slots;
        const available = open.filter((slot) => slot.available);
        const discounted = available.filter(
          (slot) => BigInt(slot.regularPrice) > BigInt(slot.price),
        );

        return {
          date: day.date,
          status:
            open.length === 0
              ? ('closed' as const)
              : available.length === 0
                ? ('sold_out' as const)
                : ('available' as const),
          sale: summarizeSale(
            discounted,
            discounted.length === available.length ? 'full' : 'partial',
          ),
        };
      }),
    };
  }

  return {
    view: 'calendar',
    mode: 'daily',
    timezone: detail.timezone,
    days: detail.days.map((day) => {
      const price = day.price;
      const regularPrice = day.regularPrice;
      const discounted =
        day.status === 'available' &&
        price !== null &&
        regularPrice !== null &&
        BigInt(regularPrice) > BigInt(price);

      return {
        date: day.date,
        status: day.status === 'booked' ? ('sold_out' as const) : day.status,
        sale: discounted
          ? summarizeSale(
              [
                {
                  price,
                  regularPrice,
                  ...(day.campaignLabel ? { campaignLabel: day.campaignLabel } : {}),
                },
              ],
              'full',
            )
          : null,
      };
    }),
  };
}

interface DiscountedUnit {
  price: string;
  regularPrice: string;
  campaignLabel?: string;
}

function summarizeSale(
  units: readonly DiscountedUnit[],
  coverage: AvailabilityCalendarSale['coverage'],
): AvailabilityCalendarSale | null {
  if (units.length === 0) return null;

  const percentages = units.flatMap((unit) => {
    const percent = saleDiscountPercent(unit.regularPrice, unit.price);
    return percent === null ? [] : [percent];
  });
  if (percentages.length === 0) return null;
  const campaignLabels: string[] = [];
  const seenLabels = new Set<string>();
  for (const unit of units) {
    const label = unit.campaignLabel?.trim();
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);
    campaignLabels.push(label);
  }

  return {
    coverage,
    minDiscountPercent: Math.min(...percentages),
    maxDiscountPercent: Math.max(...percentages),
    campaignLabels,
  };
}
