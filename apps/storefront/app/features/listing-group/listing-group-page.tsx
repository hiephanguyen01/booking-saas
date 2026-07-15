import type { HourlySlot, PublicListingResponse } from '@booking/contracts';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@booking/ui/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@booking/ui/components/ui/empty';
import { Separator } from '@booking/ui/components/ui/separator';
import { cn } from '@booking/ui/lib/utils';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  Heart,
  ImageIcon,
  MapPin,
  Menu,
  MessageCircle,
  Ruler,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { formatVnd } from '../../lib/ui';
import { storefrontPaths } from '../../lib/locale-paths';
import { dateLabelInTz, timeInTz } from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/listing-group';
import { SearchForm } from '../search/search-form';
import { listingGroupPresentation } from './listing-group-presentation';
import {
  atomicHourlySlots,
  checkoutHref,
  roomAvailabilityState,
  slotInterval,
  toggleContiguousSlot,
} from './listing-group-utils';

type LoaderData = Route.ComponentProps['loaderData'];
type RoomOption = LoaderData['roomOptions'][number];

const presentation = listingGroupPresentation();

export function ListingGroupPage({ loaderData }: { loaderData: LoaderData }) {
  const { group, state, roomOptions, locations, relatedListings } = loaderData;
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const location = group.address ?? group.workingArea;
  const trust = roomOptions[0]?.detail.trust ?? null;
  const availableOptions = roomOptions.filter((option) => option.available);
  const minimumPrice = minimumRoomPrice(availableOptions);

  return (
    <div className="font-studio bg-background pb-20">
      <SearchForm
        listingTypes={listingTypes}
        currentType={group.listingTypeSlug}
        initialState={state}
        locations={locations}
        variant="bar"
      />

      <div className="mx-auto flex max-w-292.5 flex-col gap-7 px-4 py-6 lg:px-0">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link to={storefrontPaths.home(locale)} className="transition-colors hover:text-primary">Trang chủ</Link>
          <span aria-hidden="true">/</span>
          <Link to={storefrontPaths.catalog(locale, group.listingTypeSlug)} className="transition-colors hover:text-primary">Studio</Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{group.title}</span>
        </nav>

        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-[32px]">{group.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{location}</span> : null}
              <a href="#map" className="font-medium text-primary hover:underline">Xem bản đồ</a>
              <span className="inline-flex items-center gap-1.5 text-foreground"><Star className="size-4 fill-primary text-primary" aria-hidden="true" /><strong>{presentation.rating}</strong> ({presentation.reviewCount} đánh giá)</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Lưu studio"><Heart /></Button>
            <Button type="button" variant="outline" size="icon" aria-label="Mở thêm lựa chọn"><Menu /></Button>
          </div>
        </header>

        <StudioGallery photos={group.photos} title={group.title} />

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_284px]">
          <div className="flex min-w-0 flex-col gap-8">
            <section aria-labelledby="introduction-title" className="flex flex-col gap-4">
              <h2 id="introduction-title" className="text-2xl font-semibold">Giới thiệu studio</h2>
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
                {group.description || 'Studio chưa cập nhật mô tả chi tiết.'}
              </p>
            </section>

            <Separator />

            <section aria-labelledby="amenities-title" className="flex flex-col gap-5">
              <h2 id="amenities-title" className="text-2xl font-semibold">Tiện nghi nổi bật</h2>
              {group.amenities.length ? (
                <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.amenities.map((amenity) => (
                    <div key={amenity} className="flex items-center gap-3 text-sm text-foreground">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-4" aria-hidden="true" /></span>
                      <span>{amenity}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Studio chưa cập nhật danh sách tiện nghi.</p>}
            </section>

            <Separator />

            <section aria-labelledby="promotions-title" className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <h2 id="promotions-title" className="text-2xl font-semibold">Khuyến mãi dành cho bạn</h2>
                <Badge variant="secondary"><Sparkles /> Ưu đãi</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {presentation.promotions.map((promotion) => (
                  <div key={promotion} className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span>{promotion}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="rounded-lg border bg-background p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Giá phòng từ</p>
              <p className="mt-1 text-2xl font-semibold text-primary">{minimumPrice ?? 'Chọn lịch để xem giá'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{state.mode === 'hourly' ? 'cho 1 giờ' : `cho ${state.from} – ${state.to}`}</p>
              <Button asChild className="mt-5 w-full">
                <a href="#room-options">Xem phòng trống</a>
              </Button>
            </div>

            <ProviderCard trust={trust} />

            <div id="map" className="overflow-hidden rounded-lg border bg-muted/40">
              <div className="grid h-44 place-items-center bg-[radial-gradient(circle_at_center,var(--primary)_0.75px,transparent_0.75px)] bg-[size:16px_16px] p-5 text-center">
                <div className="rounded-lg border bg-background/95 px-4 py-3 shadow-sm">
                  <MapPin className="mx-auto size-6 text-primary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium">{location || 'Vị trí studio'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Bản đồ chi tiết sẽ được tích hợp sau</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <RoomOptionsSection roomOptions={roomOptions} mode={state.mode} date={state.date} />

        <ReviewsSection />

        <RelatedStudios listings={relatedListings} listingTypeSlug={group.listingTypeSlug} />
      </div>
    </div>
  );
}

function StudioGallery({ photos, title }: { photos: string[]; title: string }) {
  if (!photos.length) {
    return <div className="grid aspect-[16/7] place-items-center rounded-lg bg-muted text-muted-foreground"><ImageIcon className="mb-2 size-8" aria-hidden="true" /><span>{title}</span></div>;
  }
  const visible = photos.slice(0, 7);
  const overflow = Math.max(0, photos.length - visible.length);
  return (
    <div className="grid overflow-hidden rounded-lg bg-muted md:h-85 md:grid-cols-[460px_1fr] md:gap-2">
      <div className="relative min-h-64 overflow-hidden md:min-h-0">
        <img src={visible[0]} alt={title} className="size-full object-cover" />
        <Button type="button" variant="secondary" size="icon" className="absolute right-4 bottom-4" aria-label="Mở ảnh lớn"><Expand /></Button>
      </div>
      <div className="hidden grid-cols-3 grid-rows-2 gap-2 md:grid">
        {Array.from({ length: 6 }, (_, index) => {
          const photo = visible[index + 1];
          const isLast = index === 5;
          return (
            <div key={photo ?? `placeholder-${index}`} className="relative overflow-hidden bg-muted">
              {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" /></div>}
              {isLast && overflow > 0 ? <div className="absolute inset-0 grid place-items-center bg-foreground/55 text-lg font-semibold text-background">+{overflow}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProviderCard({ trust }: { trust: RoomOption['detail']['trust'] | null }) {
  return (
    <div className="rounded-lg border bg-background p-5">
      <p className="text-sm text-muted-foreground">Đơn vị cung cấp</p>
      <div className="mt-4 flex items-center gap-3">
        <Avatar className="size-11"><AvatarFallback>{initials(trust?.partnerName ?? 'Studio')}</AvatarFallback></Avatar>
        <div className="min-w-0"><p className="truncate font-semibold">{trust?.partnerName ?? 'Đối tác studio'}</p><p className="text-xs text-muted-foreground">Phản hồi nhanh qua hệ thống</p></div>
      </div>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        {trust?.identityVerified ? <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" aria-hidden="true" />Đã xác minh danh tính</span> : null}
        {trust?.completedBookings ? <span className="flex items-center gap-2"><Check className="size-4 text-primary" aria-hidden="true" />{trust.completedBookings} booking hoàn tất</span> : null}
      </div>
      <Button type="button" variant="outline" className="mt-5 w-full" disabled><MessageCircle /> Nhắn tin</Button>
    </div>
  );
}

function RoomOptionsSection({ roomOptions, mode, date }: { roomOptions: RoomOption[]; mode: 'hourly' | 'daily'; date: string }) {
  return (
    <section id="room-options" aria-labelledby="room-options-title" className="scroll-mt-28 rounded-lg border bg-background p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="room-options-title" className="text-2xl font-semibold">Loại phòng</h2><p className="mt-1 text-sm text-muted-foreground">{mode === 'hourly' ? `Lịch trống ngày ${date}` : 'Giá và lịch trống theo khoảng ngày bạn đã chọn'}</p></div>
        <Badge variant="secondary"><Sparkles /> Khuyến mãi dành cho bạn</Badge>
      </div>

      {roomOptions.length ? (
        <>
          <div role="table" aria-label="Danh sách loại phòng" className="hidden overflow-hidden rounded-md border lg:block">
            <div role="row" className="grid grid-cols-[minmax(330px,1.55fr)_minmax(190px,1fr)_minmax(170px,.85fr)_220px] bg-muted/60 text-sm font-semibold">
              <div role="columnheader" className="p-4">Loại phòng</div><div role="columnheader" className="border-l p-4">Quy định số khách / phòng</div><div role="columnheader" className="border-l p-4">Giá áp dụng</div><div role="columnheader" className="border-l p-4">Lựa chọn của bạn</div>
            </div>
            <div role="rowgroup">{roomOptions.map((option) => <DesktopRoomRow key={option.child.id} option={option} mode={mode} date={date} />)}</div>
          </div>
          <div className="flex flex-col gap-4 lg:hidden">{roomOptions.map((option) => <MobileRoomCard key={option.child.id} option={option} mode={mode} date={date} />)}</div>
        </>
      ) : (
        <Empty className="border border-dashed py-16"><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Không có phòng phù hợp</EmptyTitle><EmptyDescription>Thử đổi ngày hoặc hình thức đặt ở thanh tìm kiếm phía trên.</EmptyDescription></EmptyHeader></Empty>
      )}
    </section>
  );
}

function DesktopRoomRow({ option, mode, date }: { option: RoomOption; mode: 'hourly' | 'daily'; date: string }) {
  const state = roomAvailabilityState(option);
  return (
    <article role="row" className="grid grid-cols-[minmax(330px,1.55fr)_minmax(190px,1fr)_minmax(170px,.85fr)_220px] border-t text-sm">
      <div role="cell" className="min-w-0 p-5"><RoomDetails option={option} /></div>
      <div role="cell" className="border-l p-5"><CapacityDetails option={option} /></div>
      <div role="cell" className="border-l p-5"><RoomPrice option={option} mode={mode} state={state} /></div>
      <div role="cell" className="border-l p-5"><RoomAction option={option} mode={mode} date={date} state={state} /><PolicyList depositPercent={option.detail.depositPercent} /></div>
    </article>
  );
}

function MobileRoomCard({ option, mode, date }: { option: RoomOption; mode: 'hourly' | 'daily'; date: string }) {
  const state = roomAvailabilityState(option);
  return (
    <article className="overflow-hidden rounded-lg border bg-background">
      <RoomPhotoStrip photos={option.child.photos} title={option.child.title} />
      <div className="flex flex-col gap-5 p-5">
        <RoomDetails option={option} hidePhotos />
        <div className="grid gap-4 sm:grid-cols-2"><CapacityDetails option={option} /><RoomPrice option={option} mode={mode} state={state} /></div>
        <RoomAction option={option} mode={mode} date={date} state={state} />
        <PolicyList depositPercent={option.detail.depositPercent} />
      </div>
    </article>
  );
}

function RoomDetails({ option, hidePhotos = false }: { option: RoomOption; hidePhotos?: boolean }) {
  const attributes = roomAttributeLabels(option.child.attributes);
  const amenities = option.detail.description || option.child.description;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold leading-6">{option.child.title}</h3>
      {!hidePhotos ? <RoomPhotoStrip photos={option.child.photos} title={option.child.title} /> : null}
      <div className="flex flex-col gap-2.5">
        {attributes.length ? attributes.map(({ key, label }, index) => {
          const Icon = index === 0 ? Ruler : index === 1 ? ImageIcon : Sparkles;
          return <span key={key} className="flex items-start gap-2.5 text-muted-foreground"><Icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />{label}</span>;
        }) : <span className="text-muted-foreground">Thông tin phòng đang được cập nhật.</span>}
      </div>
      {amenities ? <Collapsible><CollapsibleTrigger className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Xem mô tả <ChevronDown className="size-4" aria-hidden="true" /></CollapsibleTrigger><CollapsibleContent className="pt-3 leading-6 text-muted-foreground">{amenities}</CollapsibleContent></Collapsible> : null}
    </div>
  );
}

function RoomPhotoStrip({ photos, title }: { photos: string[]; title: string }) {
  const [cover, second, third] = photos;
  if (!cover) return <div className="grid h-36 place-items-center rounded-md bg-muted text-muted-foreground"><ImageIcon className="size-7" aria-hidden="true" /><span className="sr-only">{title}</span></div>;
  return <div className="grid h-36 grid-cols-[2fr_1fr] grid-rows-2 gap-1.5 overflow-hidden rounded-md"><img src={cover} alt={title} className="row-span-2 size-full object-cover" />{second ? <img src={second} alt="" className="size-full object-cover" /> : <div className="bg-muted" />}{third ? <img src={third} alt="" className="size-full object-cover" /> : <div className="bg-muted" />}</div>;
}

function CapacityDetails({ option }: { option: RoomOption }) {
  const capacity = roomCapacity(option.child.attributes);
  return <div className="flex flex-col gap-4"><div><p className="font-medium">Sức chứa</p><p className="mt-2 flex items-center gap-2 text-muted-foreground"><Users className="size-4" aria-hidden="true" />{capacity ? `Tối đa ${capacity} người` : 'Chưa cập nhật'}</p></div><div><p className="font-medium">Phụ thu</p><p className="mt-2 text-muted-foreground">Theo chính sách studio</p></div></div>;
}

function RoomPrice({ option, mode, state }: { option: RoomOption; mode: 'hourly' | 'daily'; state: ReturnType<typeof roomAvailabilityState> }) {
  if (state === 'booked') return <p className="font-medium text-muted-foreground">Không còn lịch trống</p>;
  if (state === 'missing-price') return <p className="font-medium text-muted-foreground">Chưa có báo giá</p>;
  return <div className="flex flex-col gap-1"><strong className="text-xl text-primary">{formatVnd(option.price)}</strong><span className="text-muted-foreground">{mode === 'hourly' ? 'giá từ / giờ' : 'tổng kỳ đã chọn'}</span></div>;
}

function RoomAction({ option, mode, date, state }: { option: RoomOption; mode: 'hourly' | 'daily'; date: string; state: ReturnType<typeof roomAvailabilityState> }) {
  const locale = useLocale();
  if (state === 'booked') return <div className="flex items-center gap-2 font-medium text-muted-foreground"><Clock3 className="size-5" aria-hidden="true" />Phòng đã được đặt</div>;
  if (state === 'missing-price') return <Button className="w-full" disabled>Chưa thể đặt</Button>;
  if (mode === 'hourly') return <ResponsiveSlotPicker option={option} date={date} />;
  if (!option.start || !option.end) return <Button className="w-full" disabled>Chưa thể đặt</Button>;
  return <Button asChild className="w-full"><Link to={checkoutHref({ locale, listingSlug: option.child.slug, mode: 'daily', start: option.start, end: option.end })}>Chọn</Link></Button>;
}

function PolicyList({ depositPercent }: { depositPercent: number }) {
  return <div className="mt-5 flex flex-col gap-2.5"><p className="font-medium">Chính sách áp dụng:</p>{presentation.policies.map((policy, index) => <span key={policy} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />{index === 0 && depositPercent > 0 ? `Đặt cọc ${depositPercent}% giá trị đơn` : policy}</span>)}</div>;
}

function ResponsiveSlotPicker({ option, date }: { option: RoomOption; date: string }) {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const slots = option.availability?.mode === 'hourly'
    ? atomicHourlySlots(option.availability.days.flatMap((day) => day.slots).filter((slot) => slot.available))
    : [];
  return (
    <>
      <div className="hidden lg:block"><Dialog open={desktopOpen} onOpenChange={setDesktopOpen}><DialogTrigger asChild><Button className="w-full"><Clock3 /> Lựa chọn giờ</Button></DialogTrigger><DialogContent className="gap-0 p-0 sm:max-w-107.5"><DialogHeader className="border-b p-5 pr-12"><DialogTitle className="text-xl">Lựa chọn giờ</DialogTitle><DialogDescription>{option.child.title}</DialogDescription></DialogHeader><SlotPickerContent option={option} slots={slots} date={date} /></DialogContent></Dialog></div>
      <div className="lg:hidden"><Drawer open={mobileOpen} onOpenChange={setMobileOpen}><DrawerTrigger asChild><Button className="w-full"><Clock3 /> Lựa chọn giờ</Button></DrawerTrigger><DrawerContent><DrawerHeader><DrawerTitle className="text-lg">Lựa chọn giờ</DrawerTitle><DrawerDescription>{option.child.title}</DrawerDescription></DrawerHeader><div className="max-h-[70vh] overflow-auto"><SlotPickerContent option={option} slots={slots} date={date} /></div></DrawerContent></Drawer></div>
    </>
  );
}

function SlotPickerContent({ option, slots, date }: { option: RoomOption; slots: HourlySlot[]; date: string }) {
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

  const bookingHref = interval ? checkoutHref({ locale, listingSlug: option.child.slug, mode: 'hourly', start: interval.start, end: interval.end }) : null;
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3 rounded-md bg-muted/60 px-4 py-3 text-sm"><CalendarDays className="size-5 text-primary" aria-hidden="true" /><span>{dateLabelInTz(`${date}T00:00:00.000Z`, timezone, locale)}</span></div>

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex h-11 w-full items-center justify-between rounded-md border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>{selected.length ? `${selected.length} khung giờ đã chọn` : 'Chọn khung giờ'}</span><ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 overflow-hidden rounded-md border">
          <div className="max-h-65 overflow-y-auto p-2">
            {slots.length ? slots.map((slot) => {
              const checked = selected.some((item) => item.startUtc === slot.startUtc);
              const id = `slot-${option.child.id}-${slot.startUtc}`.replace(/[^a-zA-Z0-9-_]/g, '-');
              return <label key={`${slot.startUtc}:${slot.endUtc}`} htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted"><Checkbox id={id} checked={checked} onCheckedChange={() => toggle(slot)} /><span className="flex-1 text-sm">{timeInTz(slot.startUtc, timezone)} – {timeInTz(slot.endUtc, timezone)}</span><span className="text-xs text-muted-foreground">{formatVnd(slot.price)}</span></label>;
            }) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">Không còn khung giờ trống.</p>}
          </div>
          <div className="flex items-center justify-between border-t p-3"><Button type="button" variant="ghost" size="sm" onClick={() => { setSelected([]); setSelectionError(''); }}>Xóa tất cả</Button><Button type="button" size="sm" onClick={() => setExpanded(false)}>Chọn</Button></div>
        </CollapsibleContent>
      </Collapsible>

      {selectionError ? <p role="alert" className="text-xs text-destructive">{selectionError}</p> : null}
      <p className="text-sm text-muted-foreground">Đã chọn <strong className="text-foreground">{selected.length}</strong> khung giờ</p>
      {selected.length ? <div className="flex flex-wrap gap-2">{selected.map((slot) => <Badge key={slot.startUtc} variant="secondary" className="gap-1.5 rounded-md py-1.5">{timeInTz(slot.startUtc, timezone)} – {timeInTz(slot.endUtc, timezone)}<button type="button" onClick={() => toggle(slot)} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Bỏ khung giờ ${timeInTz(slot.startUtc, timezone)}`}><X className="size-3.5" /></button></Badge>)}</div> : null}
      <Button asChild={Boolean(bookingHref)} disabled={!bookingHref} className="mt-1 w-full">{bookingHref ? <Link to={bookingHref}>Đặt ngay</Link> : <span>Đặt ngay</span>}</Button>
    </div>
  );
}

function ReviewsSection() {
  return (
    <section aria-labelledby="reviews-title" className="flex flex-col gap-6 border-t pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="reviews-title" className="text-2xl font-semibold">Đánh giá của khách hàng</h2><p className="mt-2 flex items-center gap-2 text-sm"><Star className="size-5 fill-primary text-primary" aria-hidden="true" /><strong className="text-lg">{presentation.rating}</strong><span className="text-muted-foreground">· {presentation.reviewCount} đánh giá</span></p></div><div className="flex gap-2"><Button type="button" variant="outline" size="icon" aria-label="Đánh giá trước"><ChevronLeft /></Button><Button type="button" variant="outline" size="icon" aria-label="Đánh giá tiếp"><ChevronRight /></Button></div></div>
      <div className="grid gap-4 lg:grid-cols-3">{presentation.reviews.map((review) => <article key={review.id} className="flex flex-col gap-4 rounded-lg border p-5"><div className="flex items-center gap-3"><Avatar><AvatarFallback>{review.initials}</AvatarFallback></Avatar><div><p className="font-semibold">{review.author}</p><p className="text-xs text-muted-foreground">{review.date}</p></div></div><div className="flex gap-0.5" aria-label={`${review.rating} trên 5 sao`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} className={cn('size-4', index < review.rating ? 'fill-primary text-primary' : 'text-muted')} aria-hidden="true" />)}</div><p className="text-sm leading-6 text-muted-foreground">{review.content}</p>{review.reply ? <div className="mt-auto rounded-md bg-muted/60 p-3 text-xs leading-5"><strong className="block text-foreground">Phản hồi từ studio</strong><span className="text-muted-foreground">{review.reply}</span></div> : null}</article>)}</div>
    </section>
  );
}

function RelatedStudios({ listings, listingTypeSlug }: { listings: PublicListingResponse[]; listingTypeSlug: string }) {
  const locale = useLocale();
  if (!listings.length) return null;
  return <section aria-labelledby="related-title" className="flex flex-col gap-5 border-t pt-8"><div><h2 id="related-title" className="text-2xl font-semibold">Studio tương tự</h2><p className="mt-1 text-sm text-muted-foreground">Một số lựa chọn khác trong cùng tenant</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{listings.slice(0, 4).map((listing) => { const photo = listing.photos.find((item): item is string => typeof item === 'string'); const path = listing.kind === 'group' ? storefrontPaths.listingGroup(locale, listing.slug) : storefrontPaths.listing(locale, listing.slug); return <Link key={listing.id} to={path} className="group overflow-hidden rounded-lg border bg-background transition-shadow hover:shadow-md"><div className="aspect-[4/3] overflow-hidden bg-muted">{photo ? <img src={photo} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <div className="grid size-full place-items-center"><Building2 className="size-7 text-muted-foreground" aria-hidden="true" /></div>}</div><div className="flex flex-col gap-2 p-4"><h3 className="line-clamp-2 font-semibold">{listing.title}</h3><p className="text-sm text-muted-foreground">{listing.listingTypeSlug === listingTypeSlug ? 'Cùng loại studio' : 'Không gian phù hợp khác'}</p><p className="font-semibold text-primary">{formatVnd(listing.priceFrom) ?? 'Liên hệ'}</p></div></Link>; })}</div></section>;
}

function minimumRoomPrice(options: RoomOption[]): string | null {
  let minimum: number | null = null;
  for (const option of options) {
    const value = Number(option.price);
    if (Number.isFinite(value) && value >= 0 && (minimum === null || value < minimum)) minimum = value;
  }
  return minimum === null ? null : formatVnd(String(minimum));
}

function roomCapacity(attributes: Record<string, unknown>): number | null {
  for (const key of ['capacity', 'maxGuests', 'guestCapacity', 'sucChua']) { const value = Number(attributes[key]); if (Number.isFinite(value) && value > 0) return value; }
  return null;
}

function roomAttributeLabels(attributes: Record<string, unknown>): Array<{ key: string; label: string }> {
  return Object.entries(attributes).flatMap(([key, value]) => {
    if (typeof value === 'boolean' || value === null || value === undefined || value === '') return [];
    if (/capacity|guest|succhua/i.test(key)) return [];
    if (typeof value === 'number' && /area|dientich/i.test(key)) return [{ key, label: `Diện tích: ${value} m²` }];
    if (typeof value === 'string' || typeof value === 'number') return [{ key, label: `${humanizeKey(key)}: ${String(value)}` }];
    return [];
  }).slice(0, 5);
}

function humanizeKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ST';
}
