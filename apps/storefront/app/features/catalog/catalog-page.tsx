import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@booking/ui/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { ChevronDown, SlidersHorizontal, Star } from 'lucide-react';
import { Form, Link, useNavigation, useOutletContext, useSearchParams } from 'react-router';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/catalog';
import { SearchForm } from '../search/search-form';
import {
  MOCK_LOCATIONS,
  MOCK_ROOM_AMENITIES,
  MOCK_STUDIO_AMENITIES,
  type FilterOptionMock,
} from './catalog-mock-data';
import { SearchResultCard } from './components/search-result-card';

const AREA_OPTIONS: FilterOptionMock[] = [
  { value: 'under-25', label: 'Dưới 25 m²', count: 132 },
  { value: '25-50', label: 'Từ 25 m² đến 50 m²', count: 152 },
  { value: '50-100', label: 'Từ 50 m² đến 100 m²', count: 314 },
  { value: 'over-100', label: 'Trên 100 m²', count: 4 },
];

export function CatalogPage({ loaderData, params }: Route.ComponentProps) {
  const { type, search, state } = loaderData;
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const navigation = useNavigation();
  const pending = navigation.state === 'loading';

  if (!type) return null;

  return (
    <main className="bg-muted/20 pb-20 font-studio">
      <SearchForm
        listingTypes={listingTypes}
        currentType={params.typeSlug}
        initialState={state}
        locations={search.locations}
        variant="bar"
      />

      <div className="mx-auto grid max-w-292.5 gap-8 px-4 py-8 lg:grid-cols-[270px_minmax(0,1fr)] lg:px-0">
        <aside className="hidden lg:block">
          <FilterPanel state={state} amenities={search.amenities} />
        </aside>

        <section aria-labelledby="search-results-title" className="min-w-0">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h1 id="search-results-title" className="text-2xl font-semibold text-foreground">
                {type.name} phù hợp với bạn
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {search.total} studio đang khả dụng
              </p>
            </div>
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline" className="lg:hidden">
                  <SlidersHorizontal data-icon="inline-start" /> Bộ lọc
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[92vh]">
                <DrawerHeader>
                  <DrawerTitle>Bộ lọc tìm kiếm</DrawerTitle>
                  <DrawerDescription>Thu hẹp kết quả theo nhu cầu của bạn.</DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-8">
                  <FilterPanel state={state} amenities={search.amenities} hideMap />
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          <SortBar state={state} />

          {pending ? (
            <div className="flex flex-col gap-6" aria-live="polite" aria-label="Đang tải kết quả">
              {Array.from({ length: 4 }, (_, index) => (
                <ResultSkeleton key={index} />
              ))}
            </div>
          ) : search.items.length === 0 ? (
            <Empty className="border bg-background py-20">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SlidersHorizontal />
                </EmptyMedia>
                <EmptyTitle>Không tìm thấy studio phù hợp</EmptyTitle>
                <EmptyDescription>Hãy thử đổi ngày, khu vực hoặc bỏ bớt bộ lọc.</EmptyDescription>
              </EmptyHeader>
              <Button asChild variant="outline">
                <Link to="?">Xóa bộ lọc</Link>
              </Button>
            </Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {search.items.map((listing) => (
                <SearchResultCard
                  key={`${listing.kind}:${listing.id}`}
                  listing={listing}
                  state={state}
                />
              ))}
            </div>
          )}

          {search.totalPages > 1 ? (
            <CatalogPagination currentPage={search.page} totalPages={search.totalPages} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function CatalogPagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const [searchParams] = useSearchParams();
  return (
    <nav className="mt-8 flex justify-center gap-2" aria-label="Phân trang">
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => {
        const next = new URLSearchParams(searchParams);
        next.set('page', String(page));
        return (
          <Button
            key={page}
            asChild
            variant={page === currentPage ? 'default' : 'outline'}
            size="icon"
          >
            <Link
              to={`?${next.toString()}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function SortBar({ state }: { state: Route.ComponentProps['loaderData']['state'] }) {
  const [searchParams] = useSearchParams();
  return (
    <div className="mb-6 flex items-center gap-4 overflow-x-auto pb-1" aria-label="Sắp xếp kết quả">
      <span className="shrink-0 text-sm font-medium text-foreground">Sắp xếp:</span>
      <div className="flex gap-3">
        <SortChip
          label="Đặt nhiều nhất"
          value="bookings"
          active={state.sort === 'bookings'}
          params={searchParams}
        />
        <SortChip
          label="Đánh giá nhiều nhất"
          value="rating"
          active={state.sort === 'rating'}
          params={searchParams}
        />
        <SortChip
          label="Giá thấp nhất"
          value="price-asc"
          active={state.sort === 'price-asc'}
          params={searchParams}
        />
        <SortChip
          label="Ưu đãi nhiều nhất"
          value="relevance"
          active={state.sort === 'relevance'}
          params={searchParams}
        />
      </div>
    </div>
  );
}

function SortChip({
  label,
  value,
  active,
  params,
}: {
  label: string;
  value: string;
  active: boolean;
  params: URLSearchParams;
}) {
  const next = new URLSearchParams(params);
  next.set('sort', value);
  next.delete('page');
  return (
    <Button
      asChild
      variant="outline"
      className={
        active
          ? 'rounded-full border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
          : 'rounded-full hover:bg-transparent hover:text-primary'
      }
    >
      <Link to={`?${next.toString()}`} aria-current={active ? 'true' : undefined}>
        {label}
      </Link>
    </Button>
  );
}

function FilterPanel({
  state,
  amenities,
  hideMap = false,
}: {
  state: Route.ComponentProps['loaderData']['state'];
  amenities: string[];
  hideMap?: boolean;
}) {
  const studioAmenities = new Map(MOCK_STUDIO_AMENITIES.map((item) => [item.value, item]));
  amenities.forEach((amenity) => {
    if (!studioAmenities.has(amenity)) {
      studioAmenities.set(amenity, { value: amenity, label: amenity, count: 0 });
    }
  });

  return (
    <Form method="get" className="flex flex-col gap-6">
      <input type="hidden" name="q" value={state.q} />
      <input type="hidden" name="mode" value={state.mode} />
      <input type="hidden" name="guests" value={state.guests} />
      {state.mode === 'hourly' && state.hasDateSelection ? (
        <input type="hidden" name="date" value={state.date} />
      ) : state.mode === 'daily' && state.hasDailyRange ? (
        <>
          <input type="hidden" name="from" value={state.from} />
          <input type="hidden" name="to" value={state.to} />
        </>
      ) : null}

      {!hideMap ? (
        <div className="h-50 overflow-hidden border border-border bg-muted">
          <img
            src="/images/catalog/map.png"
            alt="Bản đồ khu vực các studio"
            className="size-full object-cover"
          />
        </div>
      ) : null}

      <h2 className="text-base font-semibold uppercase text-foreground">Bộ lọc</h2>

      <FilterSection title="Khoảng giá">
        <div className="flex items-center gap-2">
          <PriceInput name="minPrice" value={state.minPrice ?? 200_000} label="Giá tối thiểu" />
          <span aria-hidden="true">–</span>
          <PriceInput name="maxPrice" value={state.maxPrice ?? 400_000} label="Giá tối đa" />
        </div>
      </FilterSection>

      <FilterSection title="Khu vực">
        <FilterCheckList
          options={MOCK_LOCATIONS}
          name="location"
          selected={[state.location]}
          visibleCount={6}
        />
      </FilterSection>

      <FilterSection title="Tiện ích Studio">
        <FilterCheckList
          options={[...studioAmenities.values()]}
          name="amenities"
          selected={state.amenities}
        />
      </FilterSection>

      <FilterSection title="Tiện nghi phòng">
        <FilterCheckList
          options={MOCK_ROOM_AMENITIES}
          name="amenities"
          selected={state.amenities}
          visibleCount={8}
        />
      </FilterSection>

      <FilterSection title="Diện tích phòng">
        <FilterCheckList options={AREA_OPTIONS} name="area" selected={[state.area]} />
      </FilterSection>

      <FilterSection title="Đánh giá sao">
        <RadioGroup name="rating" defaultValue="all" className="gap-3">
          <RatingOption value="all" label="Tất cả" />
          {[5, 4, 3].map((rating) => (
            <RatingOption key={rating} value={String(rating)} label={`Từ ${rating}`} stars={1} />
          ))}
        </RadioGroup>
      </FilterSection>

      <div className="sticky bottom-0 grid grid-cols-2 gap-2 bg-background/95 py-3 backdrop-blur-sm">
        <Button asChild variant="ghost">
          <Link to="?">Xóa tất cả</Link>
        </Button>
        <Button type="submit">Áp dụng</Button>
      </div>
    </Form>
  );
}

function PriceInput({ name, value, label }: { name: string; value: number; label: string }) {
  return (
    <InputGroup className="h-11 rounded-sm bg-background shadow-none">
      <InputGroupInput
        name={name}
        defaultValue={new Intl.NumberFormat('vi-VN').format(value)}
        inputMode="numeric"
        aria-label={label}
        className="h-11 px-3 text-sm"
      />
      <InputGroupAddon align="inline-end" className="pr-3 font-normal">
        đ
      </InputGroupAddon>
    </InputGroup>
  );
}

function FilterCheckList({
  options,
  name,
  selected,
  visibleCount = options.length,
}: {
  options: FilterOptionMock[];
  name: string;
  selected: string[];
  visibleCount?: number;
}) {
  const visible = options.slice(0, visibleCount);
  const hidden = options.slice(visibleCount);
  return (
    <Collapsible>
      <div className="flex flex-col gap-3">
        {visible.map((option) => (
          <FilterCheckbox key={option.value} option={option} name={name} selected={selected} />
        ))}
        {hidden.length ? (
          <CollapsibleContent className="flex flex-col gap-3">
            {hidden.map((option) => (
              <FilterCheckbox key={option.value} option={option} name={name} selected={selected} />
            ))}
          </CollapsibleContent>
        ) : null}
        {hidden.length ? (
          <CollapsibleTrigger className="group flex w-fit items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            <span className="group-data-[state=open]:hidden">Xem thêm</span>
            <span className="hidden group-data-[state=open]:inline">Thu gọn</span>
            <ChevronDown
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
        ) : null}
      </div>
    </Collapsible>
  );
}

function FilterCheckbox({
  option,
  name,
  selected,
}: {
  option: FilterOptionMock;
  name: string;
  selected: string[];
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm leading-5 text-foreground">
      <Checkbox
        name={name}
        value={option.value}
        defaultChecked={selected.includes(option.value) || selected.includes(option.label)}
        className="size-4 rounded-xs"
      />
      <span>
        {option.label} <span className="text-muted-foreground">({option.count})</span>
      </span>
    </label>
  );
}

function RatingOption({
  value,
  label,
  stars = 0,
}: {
  value: string;
  label: string;
  stars?: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <RadioGroupItem value={value} />
      <span>{label}</span>
      {Array.from({ length: stars }, (_, index) => (
        <Star key={index} className="size-4 fill-yellow-300 text-yellow-300" aria-hidden="true" />
      ))}
    </label>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm font-medium text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function ResultSkeleton() {
  return (
    <div
      className="grid overflow-hidden rounded-lg border border-border bg-background md:h-46 md:grid-cols-[248px_120px_minmax(0,1fr)]"
      aria-hidden="true"
    >
      <Skeleton className="min-h-52 rounded-none md:min-h-0" />
      <div className="relative hidden grid-rows-2 gap-1.5 bg-muted md:grid">
        <Skeleton className="rounded-none" />
        <Skeleton className="rounded-none" />
        {/* <Skeleton className="absolute right-3 top-6 size-8 rounded-full bg-background shadow-md" /> */}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3.5 w-2/5" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-24" />
        </div>

        <div className="flex flex-col items-end gap-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      </div>
    </div>
  );
}
