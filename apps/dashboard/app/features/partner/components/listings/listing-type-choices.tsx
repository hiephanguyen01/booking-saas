import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import type { ListingTypeResponse } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { ChevronRight } from 'lucide-react';
import { ListingTypeIcon } from '~/components/listing-type-icon';
import { dashboardPaths } from '~/constants/paths';

/**
 * The two selection steps every "tạo bài đăng" entry point starts with: pick a
 * listing type, and — for a `flexible` type — pick single vs. multi-item. Both
 * the toolbar dialog and the `/partner/listings/new` page render these, so a
 * partner sees the same choices whichever way in they take.
 */

/** One line on what a listing type produces. */
export function structureHint(type: ListingTypeResponse): string {
  if (type.structure === 'grouped') {
    return `Một tin đăng chứa nhiều ${type.itemLabel || 'hạng mục'}.`;
  }
  if (type.structure === 'flexible') return 'Có thể tạo độc lập hoặc theo nhóm.';
  return 'Một hạng mục độc lập.';
}

const CHOICE_CARD = cn(
  'rounded-2xl border bg-card text-left transition-colors',
  'hover:border-primary/40 hover:bg-muted/20',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
);

export function ListingTypeChoiceList({
  listingTypes,
  hrefFor,
  onSelect,
}: {
  listingTypes: ListingTypeResponse[];
  hrefFor: (type: ListingTypeResponse) => string;
  /** Intercept the click — the dialog uses this to open its second step. */
  onSelect?: (type: ListingTypeResponse, event: MouseEvent) => void;
}) {
  if (listingTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
        Chưa có loại dịch vụ nào. Liên hệ quản trị viên để được cấu hình.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {listingTypes.map((type) => (
        <Link
          key={type.id}
          to={hrefFor(type)}
          prefetch="intent"
          onClick={(event) => onSelect?.(type, event)}
          className={cn(CHOICE_CARD, 'flex min-h-24 items-center gap-4 p-4')}
        >
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-primary">
            <ListingTypeIcon imageUrl={type.iconImageUrl} name={type.icon} className="size-8" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{type.name}</span>
            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
              {structureHint(type)}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

export function ListingStructureChoices({
  type,
  onSelect,
}: {
  type: ListingTypeResponse;
  onSelect?: () => void;
}) {
  const itemLabel = type.itemLabel || 'hạng mục';
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StructureChoice
        to={dashboardPaths.partner.listingNew(type.id, 'standalone')}
        title={`Một ${itemLabel} độc lập`}
        description="Khách mở và đặt trực tiếp một lựa chọn duy nhất."
        onSelect={onSelect}
      />
      <StructureChoice
        to={dashboardPaths.partner.newListingGroup(type.id)}
        title={`Tin đăng nhiều ${itemLabel}`}
        description="Tạo thông tin chung trước, sau đó thêm giá và lịch cho từng lựa chọn."
        onSelect={onSelect}
      />
    </div>
  );
}

function StructureChoice({
  to,
  title,
  description,
  onSelect,
}: {
  to: string;
  title: string;
  description: string;
  onSelect?: () => void;
}) {
  return (
    <Link to={to} prefetch="intent" onClick={onSelect} className={cn(CHOICE_CARD, 'block p-5')}>
      <span className="block font-medium">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </Link>
  );
}
