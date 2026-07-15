import type { HourlySlot } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
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
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Separator } from '@booking/ui/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@booking/ui/components/ui/tooltip';
import { Building2, Check, Clock3, Heart, MapPin, MessageCircle, ShieldCheck, Star, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { SearchForm } from '../search/search-form';
import { formatVnd } from '../../lib/ui';
import { storefrontPaths } from '../../lib/locale-paths';
import { timeInTz } from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/listing-group';

type LoaderData = Route.ComponentProps['loaderData'];
type RoomOption = LoaderData['roomOptions'][number];

export function ListingGroupPage({ loaderData }: { loaderData: LoaderData }) {
  const { group, state, roomOptions, selectedOption, selectedQuote, start, end, locations } = loaderData;
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const location = group.address ?? group.workingArea;
  const trust = roomOptions[0]?.detail.trust ?? null;
  const selectedStart = start ?? selectedOption?.start;
  const selectedEnd = end ?? selectedOption?.end;
  const canCheckout = Boolean(selectedOption && selectedQuote && selectedStart && selectedEnd);
  const checkoutParams = canCheckout ? new URLSearchParams({
    listing: selectedOption!.child.slug,
    mode: state.mode,
    start: selectedStart!,
    end: selectedEnd!,
  }) : null;

  return (
    <main className="font-studio bg-muted/30 pb-24">
      <SearchForm
        listingTypes={listingTypes}
        currentType={group.listingTypeSlug}
        initialState={state}
        locations={locations}
        variant="bar"
      />

      <div className="mx-auto max-w-292.5 px-4 py-7 lg:px-0">
        <nav className="mb-4 text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link to={storefrontPaths.home(locale)} className="hover:text-foreground">Trang chủ</Link>
          <span aria-hidden="true"> / </span>
          <span>{group.title}</span>
        </nav>
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{group.title}</h1>
            {location ? <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{location}</p> : null}
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Star className="size-4" aria-hidden="true" /> Chưa có đánh giá</p>
          </div>
          <TooltipProvider>
            <div className="flex gap-2">
              <Tooltip><TooltipTrigger asChild><Button variant="outline" disabled><Heart /> Yêu thích</Button></TooltipTrigger><TooltipContent>Sắp ra mắt</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="outline" disabled><MessageCircle /> Chat</Button></TooltipTrigger><TooltipContent>Sắp ra mắt</TooltipContent></Tooltip>
            </div>
          </TooltipProvider>
        </header>

        <Gallery photos={group.photos} title={group.title} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="flex min-w-0 flex-col gap-8">
            <section className="rounded-md border bg-background p-6">
              <h2 className="text-xl font-semibold">Giới thiệu studio</h2>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">{group.description || 'Studio chưa cập nhật mô tả chi tiết.'}</p>
              {group.amenities.length ? <div className="mt-5 flex flex-wrap gap-2">{group.amenities.map((amenity) => <Badge key={amenity} variant="secondary"><Check className="size-3.5" aria-hidden="true" />{amenity}</Badge>)}</div> : null}
            </section>

            <section aria-labelledby="room-options-title">
              <div className="mb-4">
                <h2 id="room-options-title" className="text-2xl font-semibold">Loại phòng</h2>
                <p className="mt-1 text-sm text-muted-foreground">{state.mode === 'hourly' ? `Lịch trống ngày ${state.date}` : `Giá cho ${state.from} đến ${state.to}`}</p>
              </div>
              {roomOptions.length ? <div className="flex flex-col gap-4">{roomOptions.map((option) => <RoomRow key={option.child.id} option={option} mode={state.mode} selected={selectedOption?.child.slug === option.child.slug} searchParams={searchParams} />)}</div> : (
                <Empty className="border bg-background py-16"><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Không có phòng phù hợp</EmptyTitle><EmptyDescription>Thử đổi ngày hoặc hình thức đặt ở thanh tìm kiếm phía trên.</EmptyDescription></EmptyHeader></Empty>
              )}
            </section>

            <section className="rounded-md border bg-background p-6">
              <h2 className="text-xl font-semibold">Đánh giá của khách hàng</h2>
              <Empty className="py-10"><EmptyHeader><EmptyMedia variant="icon"><Star /></EmptyMedia><EmptyTitle>Chưa có đánh giá</EmptyTitle><EmptyDescription>Các đánh giá xác thực sẽ xuất hiện sau khi khách hoàn tất booking.</EmptyDescription></EmptyHeader></Empty>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <Card className="rounded-md">
              <CardHeader><CardTitle>Đơn vị cung cấp</CardTitle><CardDescription>Thông tin được xác minh từ hồ sơ đối tác.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="font-semibold">{trust?.partnerName ?? 'Đối tác studio'}</p>
                {trust?.identityVerified ? <Badge className="w-fit"><ShieldCheck /> Đã xác minh danh tính</Badge> : null}
                <p className="text-sm text-muted-foreground">Thông tin liên hệ được bảo vệ và chỉ hiển thị sau khi booking được xác nhận.</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden rounded-md">
              <div className="flex h-44 items-center justify-center bg-muted text-center text-sm text-muted-foreground"><MapPin className="mr-2 size-5" aria-hidden="true" />Bản đồ · Sắp ra mắt</div>
            </Card>
            {selectedQuote ? (
              <Card className="sticky top-24 rounded-md border-primary/30">
                <CardHeader><CardTitle>Tóm tắt lựa chọn</CardTitle><CardDescription>{selectedOption?.child.title}</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex justify-between text-sm"><span>Tạm tính</span><strong className="text-lg text-primary">{formatVnd(selectedQuote.subtotal)}</strong></div>
                  <Separator />
                  <Button asChild={canCheckout} disabled={!canCheckout} size="lg">
                    {canCheckout ? <Link to={`${storefrontPaths.checkout(locale)}?${checkoutParams!.toString()}`}>Tiếp tục đặt phòng</Link> : <span>Chọn lịch để tiếp tục</span>}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  if (!photos.length) return <div className="flex aspect-[16/7] items-center justify-center rounded-md bg-muted text-muted-foreground">{title}</div>;
  return <div className="grid overflow-hidden rounded-md md:h-[430px] md:grid-cols-4 md:grid-rows-2 md:gap-1"><img src={photos[0]} alt={title} className="aspect-[4/3] size-full object-cover md:col-span-2 md:row-span-2 md:aspect-auto" />{photos.slice(1, 5).map((photo) => <img key={photo} src={photo} alt="" className="hidden size-full object-cover md:block" />)}</div>;
}

function RoomRow({ option, mode, selected, searchParams }: { option: RoomOption; mode: 'hourly' | 'daily'; selected: boolean; searchParams: URLSearchParams }) {
  const capacity = roomCapacity(option.child.attributes);
  const photo = option.child.photos[0];
  const detailParams = new URLSearchParams(searchParams);
  if (option.start) detailParams.set('start', option.start);
  if (option.end) detailParams.set('end', option.end);
  detailParams.set('room', option.child.slug);
  return (
    <article className={`grid overflow-hidden rounded-md border bg-background ${selected ? 'border-primary ring-1 ring-primary' : ''} md:grid-cols-[190px_minmax(0,1fr)_190px]`}>
      {photo ? <img src={photo} alt={option.child.title} className="aspect-[4/3] size-full object-cover md:aspect-auto md:min-h-52" /> : <div className="flex min-h-40 items-center justify-center bg-muted text-muted-foreground">{option.child.title}</div>}
      <div className="flex flex-col gap-3 p-5">
        <h3 className="text-lg font-semibold">{option.child.title}</h3>
        {capacity ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" aria-hidden="true" />Tối đa {capacity} người</p> : <p className="text-sm text-muted-foreground">Sức chứa: liên hệ</p>}
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{option.child.description || option.detail.description || 'Phòng chưa cập nhật mô tả.'}</p>
        <div className="flex flex-wrap gap-2">{roomAttributeLabels(option.child.attributes).map(({ key, label }) => <Badge key={key} variant="outline">{label}</Badge>)}</div>
      </div>
      <div className="flex flex-col justify-center gap-3 border-t p-5 md:border-t-0 md:border-l">
        {option.price ? <p className="text-sm text-muted-foreground"><strong className="block text-xl text-primary">{formatVnd(option.price)}</strong>{mode === 'hourly' ? 'giá từ / lượt' : 'tổng kỳ đã chọn'}</p> : <p className="font-medium text-muted-foreground">Phòng đã được đặt</p>}
        {option.available ? mode === 'hourly' ? <ResponsiveSlotPicker option={option} searchParams={searchParams} /> : <Button asChild variant={selected ? 'secondary' : 'default'}><Link to={`?${detailParams.toString()}`}>{selected ? 'Đã chọn' : 'Chọn'}</Link></Button> : <Button disabled>Không khả dụng</Button>}
      </div>
    </article>
  );
}

function ResponsiveSlotPicker({ option, searchParams }: { option: RoomOption; searchParams: URLSearchParams }) {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const slots: HourlySlot[] = option.availability?.mode === 'hourly' ? option.availability.days.flatMap((day) => day.slots).filter((slot) => slot.available) : [];
  const content = <SlotChoices option={option} slots={slots} searchParams={searchParams} close={() => { setDesktopOpen(false); setMobileOpen(false); }} />;
  return <><div className="hidden md:block"><Dialog open={desktopOpen} onOpenChange={setDesktopOpen}><DialogTrigger asChild><Button className="w-full"><Clock3 /> Lựa chọn giờ</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Chọn khung giờ · {option.child.title}</DialogTitle><DialogDescription>Mỗi lựa chọn là một khoảng thời gian hợp lệ từ lịch studio.</DialogDescription></DialogHeader>{content}</DialogContent></Dialog></div><div className="md:hidden"><Drawer open={mobileOpen} onOpenChange={setMobileOpen}><DrawerTrigger asChild><Button className="w-full"><Clock3 /> Lựa chọn giờ</Button></DrawerTrigger><DrawerContent><DrawerHeader><DrawerTitle>Chọn khung giờ</DrawerTitle><DrawerDescription>{option.child.title}</DrawerDescription></DrawerHeader><div className="max-h-[65vh] overflow-auto px-4 pb-8">{content}</div></DrawerContent></Drawer></div></>;
}

function SlotChoices({ option, slots, searchParams, close }: { option: RoomOption; slots: HourlySlot[]; searchParams: URLSearchParams; close: () => void }) {
  const [, setSearchParams] = useSearchParams();
  const timezone = option.availability?.timezone ?? 'Asia/Ho_Chi_Minh';
  return <RadioGroup onValueChange={(start) => { const slot = slots.find((item) => item.startUtc === start); if (!slot) return; const next = new URLSearchParams(searchParams); next.set('room', option.child.slug); next.set('start', slot.startUtc); next.set('end', slot.endUtc); setSearchParams(next); close(); }} className="grid gap-3 sm:grid-cols-2">{slots.map((slot) => <label key={`${slot.startUtc}:${slot.endUtc}`} className="flex cursor-pointer items-center gap-3 rounded-md border p-4 hover:border-primary"><RadioGroupItem value={slot.startUtc} /><span className="flex-1"><strong className="block">{timeInTz(slot.startUtc, timezone)} - {timeInTz(slot.endUtc, timezone)}</strong><span className="text-sm text-muted-foreground">{formatVnd(slot.price)}</span></span></label>)}</RadioGroup>;
}

function roomCapacity(attributes: Record<string, unknown>): number | null {
  for (const key of ['capacity', 'maxGuests', 'guestCapacity', 'sucChua']) { const value = Number(attributes[key]); if (Number.isFinite(value) && value > 0) return value; }
  return null;
}

function roomAttributeLabels(attributes: Record<string, unknown>): Array<{ key: string; label: string }> {
  return Object.entries(attributes).flatMap(([key, value]) => {
    if (typeof value === 'boolean' || value === null || value === undefined || value === '') return [];
    if (/capacity|guest|succhua/i.test(key)) return [];
    if (typeof value === 'number' && /area|dientich/i.test(key)) return [{ key, label: `${value} m²` }];
    if (typeof value === 'string' || typeof value === 'number') return [{ key, label: String(value) }];
    return [];
  }).slice(0, 3);
}
