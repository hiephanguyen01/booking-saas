import type { HourlySlot, PublicListingResponse } from '@booking/contracts';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@booking/ui/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { cn } from '@booking/ui/lib/utils';
import {
  AirVent,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Dog,
  Expand,
  Heart,
  ImageIcon,
  LampCeiling,
  MapPin,
  Menu,
  MessageCircle,
  ParkingCircle,
  Ruler,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { formatListingLocation, formatVnd } from '../../lib/ui';
import { dateLabelInTz, timeInTz } from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/listing-group';
import { SearchForm } from '../search/search-form';
import { ListingCard } from '../catalog/components/listing-card';
import {
  filterPresentationReviews,
  listingGroupPresentation,
  paginatePresentationReviews,
  relatedListingPresentation,
} from './listing-group-presentation';
import {
  atomicHourlySlots,
  checkoutHref,
  roomAvailabilityState,
  slotInterval,
  toggleContiguousSlot,
} from './listing-group-utils';

type LoaderData = Route.ComponentProps['loaderData'];
type RoomOption = LoaderData['roomOptions'][number];

export function ListingGroupPage({ loaderData }: { loaderData: LoaderData }) {
  const { group, state, roomOptions, locations, relatedListings } = loaderData;
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const location = formatListingLocation(group, 'full');
  const trust = roomOptions[0]?.detail.trust ?? null;
  const availableOptions = roomOptions.filter((option) => option.available);
  const minimumPrice = minimumRoomPrice(availableOptions);
  const presentation = listingGroupPresentation(
    group.id || group.slug,
    group.photos,
    roomOptions[0]?.child.title,
  );
  const mapsHref = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;

  return (
    <div className="font-studio overflow-x-clip bg-muted/30 pb-20 text-foreground">
      <SearchForm
        listingTypes={listingTypes}
        currentType={group.listingTypeSlug}
        initialState={state}
        locations={locations}
        variant="bar"
      />

      <div className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 py-4 xl:px-0">
        <section className="rounded-lg bg-background p-4 shadow-[0_1px_5px_rgba(16,24,40,0.06)] sm:p-6">
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight md:text-2xl">{group.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                {location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden="true" />
                    {location}
                  </span>
                ) : null}
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Xem bản đồ
                  </a>
                ) : null}
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <Stars rating={presentation.rating} compact />
                  <strong>{presentation.rating}</strong>
                  <span className="text-muted-foreground">{presentation.reviewCount} đánh giá</span>
                </span>
              </div>
            </div>
            <HeaderActions title={group.title} />
          </header>
          <StudioGallery photos={group.photos} title={group.title} />
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,870px)_284px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section
              aria-labelledby="introduction-title"
              className="rounded-lg bg-background p-4 shadow-[0_1px_5px_rgba(16,24,40,0.06)] sm:p-6"
            >
              <h2 id="introduction-title" className="text-base font-semibold">
                Giới thiệu
              </h2>
              <ExpandableDescription description={group.description} />
            </section>

            <section
              aria-labelledby="amenities-title"
              className="rounded-lg bg-background p-4 shadow-[0_1px_5px_rgba(16,24,40,0.06)] sm:p-6"
            >
              <h2 id="amenities-title" className="text-base font-semibold">
                Tiện ích
              </h2>
              {group.amenities.length ? (
                <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  {group.amenities.slice(0, 12).map((amenity) => {
                    const Icon = amenityIcon(amenity);
                    return (
                      <div key={amenity} className="flex min-w-0 items-center gap-2.5 text-sm">
                        <Icon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">{amenity}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Studio chưa cập nhật danh sách tiện ích.
                </p>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="rounded-lg bg-background p-5 text-right shadow-[0_1px_5px_rgba(16,24,40,0.08)]">
              <p className="text-sm text-muted-foreground">
                từ <strong className="text-xl text-primary">{minimumPrice ?? 'Liên hệ'}</strong>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.mode === 'hourly' ? 'cho 1 giờ' : `cho ${state.from} - ${state.to}`}
              </p>
              <Button asChild className="mt-5 w-full">
                <a href="#room-options">Xem phòng</a>
              </Button>
            </div>
            <ProviderCard trust={trust} />
          </aside>
        </div>

        <RoomOptionsSection
          roomOptions={roomOptions}
          mode={state.mode}
          date={state.date}
          promotion={presentation.promotion}
          policies={presentation.policies}
        />

        <ReviewsSection presentation={presentation} />

        <RelatedStudios listings={relatedListings} />
      </div>
    </div>
  );
}

function StudioGallery({ photos, title }: { photos: string[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const visible = photos.slice(0, 7);
  const overflow = Math.max(0, photos.length - 7);

  function show(index: number): void {
    if (!photos[index]) return;
    setActiveIndex(index);
    setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="grid h-64 overflow-hidden rounded-md bg-muted md:h-85 md:grid-cols-[460px_1fr] md:gap-3">
        <button
          type="button"
          onClick={() => show(0)}
          disabled={!visible[0]}
          className="group relative min-h-64 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-0"
          aria-label={visible[0] ? `Xem ảnh chính của ${title}` : `Chưa có ảnh của ${title}`}
        >
          {visible[0] ? (
            <img
              src={visible[0]}
              alt={title}
              width={920}
              height={680}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <GalleryPlaceholder title={title} />
          )}
          {visible[0] ? (
            <span className="absolute right-4 bottom-4 grid size-11 place-items-center rounded-full bg-background/95 shadow-sm">
              <Expand className="size-4" aria-hidden="true" />
            </span>
          ) : null}
        </button>
        <div className="hidden grid-cols-3 grid-rows-2 gap-3 md:grid">
          {Array.from({ length: 6 }, (_, index) => {
            const photo = visible[index + 1];
            const isLast = index === 5;
            return (
              <button
                type="button"
                key={photo ?? `placeholder-${index}`}
                onClick={() => show(index + 1)}
                disabled={!photo}
                className="relative overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={photo ? `Xem ảnh ${index + 2} của ${title}` : 'Chưa có ảnh'}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    width={430}
                    height={328}
                    className="size-full object-cover"
                  />
                ) : (
                  <GalleryPlaceholder />
                )}
                {isLast && overflow > 0 ? (
                  <span className="absolute inset-0 grid place-items-center bg-foreground/55 text-lg font-semibold text-background">
                    +{overflow}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <DialogContent className="max-h-[90vh] gap-4 overflow-hidden p-4 sm:max-w-5xl">
        <DialogHeader className="pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Ảnh {activeIndex + 1} / {Math.max(photos.length, 1)}
          </DialogDescription>
        </DialogHeader>
        {photos[activeIndex] ? (
          <img
            src={photos[activeIndex]}
            alt={`${title}, ảnh ${activeIndex + 1}`}
            width={1400}
            height={1000}
            className="max-h-[68vh] w-full rounded-md object-contain"
          />
        ) : (
          <div className="h-80">
            <GalleryPlaceholder title={title} />
          </div>
        )}
        {photos.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, index) => (
              <button
                type="button"
                key={`${photo}-${index}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Chuyển đến ảnh ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={cn(
                  'h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  index === activeIndex ? 'border-primary' : 'border-transparent',
                )}
              >
                <img src={photo} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function GalleryPlaceholder({ title }: { title?: string }) {
  return (
    <span className="grid size-full place-items-center bg-muted text-muted-foreground">
      <span className="flex flex-col items-center gap-2">
        <ImageIcon className="size-7" aria-hidden="true" />
        {title ? <span className="text-sm">{title}</span> : null}
      </span>
    </span>
  );
}

function HeaderActions({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        copyTextFallback(window.location.href);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(copyTextFallback(window.location.href));
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={`Lưu ${title}`}
        title="Tính năng lưu studio đang được phát triển"
      >
        <Heart className="text-primary" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Mở thêm lựa chọn"
          >
            <Menu />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => void copyLink()}>
              <Copy /> {copied ? 'Đã sao chép' : 'Sao chép liên kết'}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function copyTextFallback(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

function ExpandableDescription({ description }: { description: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const copy = description || 'Studio chưa cập nhật mô tả chi tiết.';
  return (
    <div className="mt-4">
      <p
        className={cn(
          'whitespace-pre-wrap text-sm leading-6 text-muted-foreground',
          !expanded && 'line-clamp-6',
        )}
      >
        {copy}
      </p>
      {copy.length > 220 ? (
        <Button
          type="button"
          variant="link"
          className="mt-1 h-11 px-0 text-primary"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Thu gọn' : 'Xem thêm'}{' '}
          <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
        </Button>
      ) : null}
    </div>
  );
}

function ProviderCard({ trust }: { trust: RoomOption['detail']['trust'] | null }) {
  return (
    <div className="rounded-lg bg-background p-5 shadow-[0_1px_5px_rgba(16,24,40,0.08)]">
      <div className="flex items-center gap-3">
        <Avatar className="size-11">
          <AvatarFallback>{initials(trust?.partnerName ?? 'Studio')}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold">{trust?.partnerName ?? 'Đối tác studio'}</p>
          <p className="text-xs text-muted-foreground">
            {presentationProviderBookings(trust)} đã đặt
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        {trust?.identityVerified ? (
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Đã xác minh danh tính
          </span>
        ) : null}
        {trust?.completedBookings ? (
          <span className="flex items-center gap-2">
            <Check className="size-4 text-primary" aria-hidden="true" />
            {trust.completedBookings} booking hoàn tất
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-5 w-full"
        disabled
        title="Trang nhà cung cấp đang được phát triển"
      >
        <MessageCircle /> Xem nhà cung cấp
      </Button>
    </div>
  );
}

function RoomOptionsSection({
  roomOptions,
  mode,
  date,
  promotion,
  policies,
}: {
  roomOptions: RoomOption[];
  mode: 'hourly' | 'daily';
  date: string;
  promotion: string;
  policies: string[];
}) {
  return (
    <section
      id="room-options"
      aria-labelledby="room-options-title"
      className="scroll-mt-28 rounded-lg bg-background p-4 shadow-[0_1px_5px_rgba(16,24,40,0.06)] sm:p-6"
    >
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="room-options-title" className="text-base font-semibold">
            Loại phòng
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'hourly'
              ? `Lịch trống ngày ${date}`
              : 'Giá và lịch trống theo khoảng ngày bạn đã chọn'}
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-400 bg-emerald-50 text-emerald-700">
          <Sparkles /> Khuyến mãi {promotion} dành cho bạn
        </Badge>
      </div>

      {roomOptions.length ? (
        <>
          <div
            role="table"
            aria-label="Danh sách loại phòng"
            className="hidden overflow-hidden rounded-md border xl:block"
          >
            <div
              role="row"
              className="grid grid-cols-[374px_280px_224px_244px] bg-muted/60 text-xs font-semibold"
            >
              <div role="columnheader" className="p-4">
                Loại phòng
              </div>
              <div role="columnheader" className="border-l p-4">
                Quy định số khách / phòng
              </div>
              <div role="columnheader" className="border-l p-4">
                Giá áp dụng
              </div>
              <div role="columnheader" className="border-l p-4">
                Lựa chọn của bạn
              </div>
            </div>
            <div role="rowgroup">
              {roomOptions.map((option) => (
                <DesktopRoomRow
                  key={option.child.id}
                  option={option}
                  mode={mode}
                  date={date}
                  policies={policies}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 xl:hidden">
            {roomOptions.map((option) => (
              <MobileRoomCard
                key={option.child.id}
                option={option}
                mode={mode}
                date={date}
                policies={policies}
              />
            ))}
          </div>
        </>
      ) : (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>Không có phòng phù hợp</EmptyTitle>
            <EmptyDescription>
              Thử đổi ngày hoặc hình thức đặt ở thanh tìm kiếm phía trên.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

function DesktopRoomRow({
  option,
  mode,
  date,
  policies,
}: {
  option: RoomOption;
  mode: 'hourly' | 'daily';
  date: string;
  policies: string[];
}) {
  const state = roomAvailabilityState(option);
  return (
    <article role="row" className="grid grid-cols-[374px_280px_224px_244px] border-t text-sm">
      <div role="cell" className="min-w-0 p-5">
        <RoomDetails option={option} />
      </div>
      <div role="cell" className="border-l p-5">
        <CapacityDetails option={option} />
      </div>
      <div role="cell" className="border-l p-5">
        <RoomPrice option={option} mode={mode} state={state} />
      </div>
      <div role="cell" className="border-l p-5">
        <RoomAction option={option} mode={mode} date={date} state={state} />
        <PolicyList depositPercent={option.detail.depositPercent} policies={policies} />
      </div>
    </article>
  );
}

function MobileRoomCard({
  option,
  mode,
  date,
  policies,
}: {
  option: RoomOption;
  mode: 'hourly' | 'daily';
  date: string;
  policies: string[];
}) {
  const state = roomAvailabilityState(option);
  return (
    <article className="overflow-hidden rounded-lg border bg-background">
      <RoomPhotoStrip photos={option.child.photos} title={option.child.title} />
      <div className="flex flex-col gap-5 p-5">
        <RoomDetails option={option} hidePhotos />
        <div className="grid gap-4 sm:grid-cols-2">
          <CapacityDetails option={option} />
          <RoomPrice option={option} mode={mode} state={state} />
        </div>
        <RoomAction option={option} mode={mode} date={date} state={state} />
        <PolicyList depositPercent={option.detail.depositPercent} policies={policies} />
      </div>
    </article>
  );
}

function RoomDetails({ option, hidePhotos = false }: { option: RoomOption; hidePhotos?: boolean }) {
  const attributes = roomAttributeLabels(option.child.attributes);
  const amenities = option.detail.description || option.child.description;
  const location = formatListingLocation(option.detail);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold leading-6">{option.child.title}</h3>
      {location ? (
        <span className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {location}
        </span>
      ) : null}
      {!hidePhotos ? (
        <RoomPhotoStrip photos={option.child.photos} title={option.child.title} />
      ) : null}
      <div className="flex flex-col gap-2.5">
        {attributes.length ? (
          attributes.map(({ key, label }, index) => {
            const Icon = index === 0 ? Ruler : index === 1 ? ImageIcon : Sparkles;
            return (
              <span key={key} className="flex items-start gap-2.5 text-muted-foreground">
                <Icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                {label}
              </span>
            );
          })
        ) : (
          <span className="text-muted-foreground">Thông tin phòng đang được cập nhật.</span>
        )}
      </div>
      {amenities ? (
        <Collapsible>
          <CollapsibleTrigger className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Xem mô tả <ChevronDown className="size-4" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 leading-6 text-muted-foreground">
            {amenities}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function RoomPhotoStrip({ photos, title }: { photos: string[]; title: string }) {
  const [cover, second, third] = photos;
  if (!cover)
    return (
      <div className="grid h-36 place-items-center rounded-md bg-muted text-muted-foreground">
        <ImageIcon className="size-7" aria-hidden="true" />
        <span className="sr-only">{title}</span>
      </div>
    );
  return (
    <div className="grid h-36 grid-cols-[2fr_1fr] grid-rows-2 gap-1.5 overflow-hidden rounded-md">
      <img src={cover} alt={title} className="row-span-2 size-full object-cover" />
      {second ? (
        <img src={second} alt="" className="size-full object-cover" />
      ) : (
        <div className="bg-muted" />
      )}
      {third ? (
        <img src={third} alt="" className="size-full object-cover" />
      ) : (
        <div className="bg-muted" />
      )}
    </div>
  );
}

function CapacityDetails({ option }: { option: RoomOption }) {
  const capacity = roomCapacity(option.child.attributes);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-medium">Sức chứa</p>
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <Users className="size-4" aria-hidden="true" />
          {capacity ? `Tối đa ${capacity} người` : 'Chưa cập nhật'}
        </p>
      </div>
      <div>
        <p className="font-medium">Phụ thu</p>
        <p className="mt-2 text-muted-foreground">Theo chính sách studio</p>
      </div>
    </div>
  );
}

function RoomPrice({
  option,
  mode,
  state,
}: {
  option: RoomOption;
  mode: 'hourly' | 'daily';
  state: ReturnType<typeof roomAvailabilityState>;
}) {
  if (state === 'booked')
    return <p className="font-medium text-muted-foreground">Không còn lịch trống</p>;
  if (state === 'missing-price')
    return <p className="font-medium text-muted-foreground">Chưa có báo giá</p>;
  return (
    <div className="flex flex-col gap-1">
      <strong className="text-xl text-primary">{formatVnd(option.price)}</strong>
      <span className="text-muted-foreground">
        {mode === 'hourly' ? 'giá từ / giờ' : 'tổng kỳ đã chọn'}
      </span>
    </div>
  );
}

function RoomAction({
  option,
  mode,
  date,
  state,
}: {
  option: RoomOption;
  mode: 'hourly' | 'daily';
  date: string;
  state: ReturnType<typeof roomAvailabilityState>;
}) {
  const locale = useLocale();
  if (state === 'booked')
    return (
      <div className="flex items-center gap-2 font-medium text-muted-foreground">
        <Clock3 className="size-5" aria-hidden="true" />
        Phòng đã được đặt
      </div>
    );
  if (state === 'missing-price')
    return (
      <Button className="w-full" disabled>
        Chưa thể đặt
      </Button>
    );
  if (mode === 'hourly') return <ResponsiveSlotPicker option={option} date={date} />;
  if (!option.start || !option.end)
    return (
      <Button className="w-full" disabled>
        Chưa thể đặt
      </Button>
    );
  return (
    <Button asChild className="w-full">
      <Link
        to={checkoutHref({
          locale,
          listingSlug: option.child.slug,
          mode: 'daily',
          start: option.start,
          end: option.end,
        })}
      >
        Chọn
      </Link>
    </Button>
  );
}

function PolicyList({ depositPercent, policies }: { depositPercent: number; policies: string[] }) {
  return (
    <div className="mt-5 flex flex-col gap-2.5">
      <p className="font-medium">Chính sách áp dụng:</p>
      {policies.map((policy, index) => (
        <span
          key={policy}
          className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"
        >
          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {index === 0 && depositPercent > 0 ? `Đặt cọc ${depositPercent}% giá trị đơn` : policy}
        </span>
      ))}
    </div>
  );
}

function ResponsiveSlotPicker({ option, date }: { option: RoomOption; date: string }) {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const slots =
    option.availability?.mode === 'hourly'
      ? atomicHourlySlots(
          option.availability.days.flatMap((day) => day.slots).filter((slot) => slot.available),
        )
      : [];
  return (
    <>
      <div className="hidden lg:block">
        <Dialog open={desktopOpen} onOpenChange={setDesktopOpen}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Clock3 /> Lựa chọn giờ
            </Button>
          </DialogTrigger>
          <DialogContent className="gap-0 p-0 sm:max-w-107.5">
            <DialogHeader className="border-b p-5 pr-12">
              <DialogTitle className="text-xl">Lựa chọn giờ</DialogTitle>
              <DialogDescription>{option.child.title}</DialogDescription>
            </DialogHeader>
            <SlotPickerContent option={option} slots={slots} date={date} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="lg:hidden">
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerTrigger asChild>
            <Button className="w-full">
              <Clock3 /> Lựa chọn giờ
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="text-lg">Lựa chọn giờ</DrawerTitle>
              <DrawerDescription>{option.child.title}</DrawerDescription>
            </DrawerHeader>
            <div className="max-h-[70vh] overflow-auto">
              <SlotPickerContent option={option} slots={slots} date={date} />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function SlotPickerContent({
  option,
  slots,
  date,
}: {
  option: RoomOption;
  slots: HourlySlot[];
  date: string;
}) {
  const locale = useLocale();
  const [selected, setSelected] = useState<HourlySlot[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const timezone = option.availability?.timezone ?? 'Asia/Ho_Chi_Minh';
  const interval = slotInterval(selected);

  function toggle(slot: HourlySlot): void {
    const result = toggleContiguousSlot(selected, slot);
    setSelected(result.slots);
    setSelectionError(result.changed ? '' : 'Chỉ có thể chọn hoặc bỏ các khung giờ liền nhau.');
  }

  const bookingHref = interval
    ? checkoutHref({
        locale,
        listingSlug: option.child.slug,
        mode: 'hourly',
        start: interval.start,
        end: interval.end,
      })
    : null;
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3 rounded-md bg-muted/60 px-4 py-3 text-sm">
        <CalendarDays className="size-5 text-primary" aria-hidden="true" />
        <span>{dateLabelInTz(`${date}T00:00:00.000Z`, timezone, locale)}</span>
      </div>

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex h-11 w-full items-center justify-between rounded-md border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>{selected.length ? `${selected.length} khung giờ đã chọn` : 'Chọn khung giờ'}</span>
          <ChevronDown
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 overflow-hidden rounded-md border">
          <div className="max-h-65 overflow-y-auto p-2">
            {slots.length ? (
              slots.map((slot) => {
                const checked = selected.some((item) => item.startUtc === slot.startUtc);
                const id = `slot-${option.child.id}-${slot.startUtc}`.replace(
                  /[^a-zA-Z0-9-_]/g,
                  '-',
                );
                return (
                  <label
                    key={`${slot.startUtc}:${slot.endUtc}`}
                    htmlFor={id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted"
                  >
                    <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(slot)} />
                    <span className="flex-1 text-sm">
                      {timeInTz(slot.startUtc, timezone)} - {timeInTz(slot.endUtc, timezone)}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatVnd(slot.price)}</span>
                  </label>
                );
              })
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Không còn khung giờ trống.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between border-t p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected([]);
                setSelectionError('');
              }}
            >
              Xóa tất cả
            </Button>
            <Button type="button" size="sm" onClick={() => setExpanded(false)}>
              Chọn
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {selectionError ? (
        <p role="alert" className="text-xs text-destructive">
          {selectionError}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Đã chọn <strong className="text-foreground">{selected.length}</strong> khung giờ
      </p>
      {selected.length ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((slot) => (
            <Badge key={slot.startUtc} variant="secondary" className="gap-1.5 rounded-md py-1.5">
              {timeInTz(slot.startUtc, timezone)} - {timeInTz(slot.endUtc, timezone)}
              <button
                type="button"
                onClick={() => toggle(slot)}
                className="grid size-6 place-items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Bỏ khung giờ ${timeInTz(slot.startUtc, timezone)}`}
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Button asChild={Boolean(bookingHref)} disabled={!bookingHref} className="mt-1 w-full">
        {bookingHref ? <Link to={bookingHref}>Đặt ngay</Link> : <span>Đặt ngay</span>}
      </Button>
    </div>
  );
}

function ReviewsSection({
  presentation,
}: {
  presentation: ReturnType<typeof listingGroupPresentation>;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const filtered = filterPresentationReviews(presentation.reviews, rating);
  const visible = paginatePresentationReviews(filtered, visibleCount);

  function selectRating(nextRating: number | null): void {
    setRating(nextRating);
    setVisibleCount(3);
  }

  return (
    <section
      aria-labelledby="reviews-title"
      className="rounded-lg bg-background p-4 shadow-[0_1px_5px_rgba(16,24,40,0.06)] sm:p-6"
    >
      <div>
        <h2 id="reviews-title" className="text-base font-semibold">
          Đánh giá
        </h2>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Stars rating={presentation.rating} />
          <strong>{presentation.rating}</strong>
          <span className="text-muted-foreground">{presentation.reviewCount} đánh giá</span>
        </p>
      </div>
      <div
        className="mt-5 flex gap-2 overflow-x-auto pb-2"
        role="group"
        aria-label="Lọc đánh giá theo số sao"
      >
        {[5, 4, 3, 2, 1].map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={rating === value ? 'default' : 'outline'}
            onClick={() => selectRating(rating === value ? null : value)}
            aria-pressed={rating === value}
            className="min-h-11 shrink-0"
          >
            {value} <Star className="fill-current" /> (
            {presentation.reviewDistribution[value as 1 | 2 | 3 | 4 | 5]})
          </Button>
        ))}
      </div>
      <div className="mt-3 flex flex-col">
        {visible.length ? (
          visible.map((review) => (
            <article key={review.id} className="flex flex-col gap-3 py-5 [&+&]:border-t">
              <div className="flex items-start gap-3">
                <Avatar className="size-10">
                  <AvatarFallback>{review.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{review.author}</p>
                      <Stars rating={review.rating} compact />
                    </div>
                    <p className="text-xs text-muted-foreground">{review.date}</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{review.content}</p>
                  {review.photos.length ? (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {review.photos.map((photo, index) => (
                        <img
                          key={`${photo}-${index}`}
                          src={photo}
                          alt={`Ảnh đánh giá của ${review.author} ${index + 1}`}
                          width={96}
                          height={72}
                          loading="lazy"
                          className="h-18 w-24 shrink-0 rounded-md object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {review.roomName ? (
                    <p className="mt-2 text-xs text-muted-foreground">Phòng: {review.roomName}</p>
                  ) : null}
                  {review.reply ? (
                    <div className="mt-4 flex gap-3 rounded-md bg-muted/60 p-3 text-xs leading-5">
                      <Avatar className="size-8">
                        <AvatarFallback>ST</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>Phản hồi từ studio</strong>
                          <span className="text-muted-foreground">{review.date}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{review.reply}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Chưa có đánh giá {rating} sao.
          </p>
        )}
      </div>
      {visible.length < filtered.length ? (
        <div className="flex justify-center border-t pt-4">
          <Button
            type="button"
            variant="link"
            onClick={() => setVisibleCount((count) => count + 3)}
          >
            Xem thêm <ChevronDown />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function RelatedStudios({ listings }: { listings: PublicListingResponse[] }) {
  if (!listings.length) return null;
  return (
    <section
      aria-labelledby="related-title"
      className="rounded-lg bg-background p-4 shadow-[0_1px_5px_rgba(16,24,40,0.06)] sm:p-6"
    >
      <h2 id="related-title" className="text-base font-semibold">
        Studio tương tự
      </h2>
      <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0">
        {listings.slice(0, 4).map((listing) => (
          <div
            key={listing.id}
            className="w-[78vw] max-w-69.5 shrink-0 snap-start sm:w-69.5 xl:w-auto xl:max-w-none"
          >
            <ListingCard
              listing={listing}
              presentation={relatedListingPresentation(
                listing.id || listing.slug,
                listing.priceFrom,
              )}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Stars({ rating, compact = false }: { rating: number; compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      aria-label={`${rating.toFixed(1)} trên 5 sao`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn(
            compact ? 'size-3' : 'size-4',
            index < Math.round(rating) && 'fill-current',
          )}
        />
      ))}
    </span>
  );
}

function minimumRoomPrice(options: RoomOption[]): string | null {
  let minimum: number | null = null;
  for (const option of options) {
    const value = Number(option.price);
    if (Number.isFinite(value) && value >= 0 && (minimum === null || value < minimum))
      minimum = value;
  }
  return minimum === null ? null : formatVnd(String(minimum));
}

function amenityIcon(amenity: string) {
  const normalized = amenity.toLocaleLowerCase('vi');
  if (/wifi|wi-fi|internet/.test(normalized)) return Wifi;
  if (/xe|đỗ|đậu/.test(normalized)) return ParkingCircle;
  if (/camera|an ninh/.test(normalized)) return Camera;
  if (/điều hòa|máy lạnh|air/.test(normalized)) return AirVent;
  if (/thú cưng|pet/.test(normalized)) return Dog;
  if (/đèn|ánh sáng/.test(normalized)) return LampCeiling;
  return Check;
}

function presentationProviderBookings(trust: RoomOption['detail']['trust'] | null): number {
  return trust?.completedBookings && trust.completedBookings > 0 ? trust.completedBookings : 456;
}

function roomCapacity(attributes: Record<string, unknown>): number | null {
  for (const key of ['capacity', 'maxGuests', 'guestCapacity', 'sucChua']) {
    const value = Number(attributes[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function roomAttributeLabels(
  attributes: Record<string, unknown>,
): Array<{ key: string; label: string }> {
  return Object.entries(attributes)
    .flatMap(([key, value]) => {
      if (typeof value === 'boolean' || value === null || value === undefined || value === '')
        return [];
      if (/capacity|guest|succhua/i.test(key)) return [];
      if (typeof value === 'number' && /area|dientich/i.test(key))
        return [{ key, label: `Diện tích: ${value} m²` }];
      if (typeof value === 'string' || typeof value === 'number')
        return [{ key, label: `${humanizeKey(key)}: ${String(value)}` }];
      return [];
    })
    .slice(0, 5);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'ST'
  );
}
