import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
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
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { SlidersHorizontal, Star } from 'lucide-react';
import {
  Form,
  Link,
  useNavigate,
  useNavigation,
  useOutletContext,
  useSearchParams,
} from 'react-router';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/catalog';
import { SearchForm } from '../search/search-form';
import { SearchResultCard } from './components/search-result-card';

export function CatalogPage({ loaderData, params }: Route.ComponentProps) {
  const { type, search, state } = loaderData;
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pending = navigation.state === 'loading';

  if (!type) return null;

  return (
    <main className="font-studio bg-muted/30 pb-20">
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 id="search-results-title" className="text-2xl font-semibold text-foreground">
                {type.name} phù hợp với bạn
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{search.total} kết quả khả dụng</p>
            </div>
            <div className="flex items-center gap-2">
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
                    <FilterPanel state={state} amenities={search.amenities} />
                  </div>
                </DrawerContent>
              </Drawer>
              <NativeSelect
                value={state.sort}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams);
                  next.set('sort', event.target.value);
                  next.delete('page');
                  void navigate(`?${next.toString()}`);
                }}
                aria-label="Sắp xếp kết quả"
                className="min-w-44 bg-background"
              >
                <NativeSelectOption value="relevance">Phù hợp nhất</NativeSelectOption>
                <NativeSelectOption value="price-asc">Giá thấp nhất</NativeSelectOption>
                <NativeSelectOption value="rating" disabled>
                  Đánh giá cao (Chờ Backend)
                </NativeSelectOption>
                <NativeSelectOption value="bookings" disabled>
                  Nhiều lượt đặt (Chờ Backend)
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          <div className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Sắp xếp nhanh">
            <SortChip
              label="Phù hợp nhất"
              value="relevance"
              active={state.sort === 'relevance'}
              params={searchParams}
            />
            <SortChip
              label="Giá thấp nhất"
              value="price-asc"
              active={state.sort === 'price-asc'}
              params={searchParams}
            />
            <Button variant="outline" size="sm" disabled>
              Đánh giá cao · Chờ Backend
            </Button>
            <Button variant="outline" size="sm" disabled>
              Nhiều lượt đặt · Chờ Backend
            </Button>
          </div>

          {pending ? (
            <div className="flex flex-col gap-5" aria-live="polite" aria-label="Đang tải kết quả">
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
            <div className="flex flex-col gap-5">
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
            <nav className="mt-8 flex justify-center gap-2" aria-label="Phân trang">
              {Array.from({ length: search.totalPages }, (_, index) => index + 1).map((page) => {
                const next = new URLSearchParams(searchParams);
                next.set('page', String(page));
                return (
                  <Button
                    key={page}
                    asChild
                    variant={page === search.page ? 'default' : 'outline'}
                    size="icon"
                  >
                    <Link
                      to={`?${next.toString()}`}
                      aria-current={page === search.page ? 'page' : undefined}
                    >
                      {page}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
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
    <Button asChild variant={active ? 'default' : 'outline'} size="sm">
      <Link to={`?${next.toString()}`}>{label}</Link>
    </Button>
  );
}

function FilterPanel({
  state,
  amenities,
}: {
  state: Route.ComponentProps['loaderData']['state'];
  amenities: string[];
}) {
  return (
    <Form
      method="get"
      className="flex flex-col gap-6 rounded-md border bg-background p-5 shadow-sm"
    >
      <input type="hidden" name="q" value={state.q} />
      <input type="hidden" name="location" value={state.location} />
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
      <FilterSection title="Khoảng giá">
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="minPrice"
            type="number"
            min="0"
            defaultValue={state.minPrice ?? ''}
            placeholder="Từ"
            aria-label="Giá tối thiểu"
          />
          <Input
            name="maxPrice"
            type="number"
            min="0"
            defaultValue={state.maxPrice ?? ''}
            placeholder="Đến"
            aria-label="Giá tối đa"
          />
        </div>
      </FilterSection>
      <FilterSection title="Tiện nghi studio">
        {amenities.length ? (
          amenities.slice(0, 8).map((amenity) => (
            <label key={amenity} className="flex min-h-8 items-center gap-2 text-sm">
              <Checkbox
                name="amenities"
                value={amenity}
                defaultChecked={state.amenities.includes(amenity)}
              />
              <span>{amenity}</span>
            </label>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu tiện nghi.</p>
        )}
      </FilterSection>
      <FilterSection title="Diện tích phòng">
        <NativeSelect name="area" defaultValue={state.area} className="w-full">
          <NativeSelectOption value="">Tất cả diện tích</NativeSelectOption>
          <NativeSelectOption value="under-25">Dưới 25 m²</NativeSelectOption>
          <NativeSelectOption value="25-50">25 - 50 m²</NativeSelectOption>
          <NativeSelectOption value="50-100">50 - 100 m²</NativeSelectOption>
          <NativeSelectOption value="over-100">Trên 100 m²</NativeSelectOption>
        </NativeSelect>
      </FilterSection>
      <FilterSection title="Đánh giá">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-disabled="true">
          <Star className="size-4" aria-hidden="true" /> Chờ Backend cập nhật
        </div>
      </FilterSection>
      <Button type="submit">Áp dụng bộ lọc</Button>
      <Button asChild variant="ghost">
        <Link to="?">Xóa tất cả</Link>
      </Button>
    </Form>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function ResultSkeleton() {
  return (
    <div className="grid overflow-hidden rounded-md border bg-background md:grid-cols-[310px_1fr]">
      <Skeleton className="aspect-[4/3] md:aspect-auto md:h-64" />
      <div className="flex flex-col gap-4 p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-auto h-10 w-40 self-end" />
      </div>
    </div>
  );
}
