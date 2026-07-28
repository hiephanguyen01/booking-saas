import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { Badge } from '@booking/ui/components/ui/badge';
import { BriefcaseBusiness, CalendarCheck, ShieldCheck, Star } from 'lucide-react';
import { Link } from 'react-router';
import { ListingCard } from '~/features/catalog/components/listing-card';
import { PublicReviewsSection } from '~/components/public-reviews-section';
import { SectionCard } from '~/components/section-card';
import { storefrontPaths } from '~/lib/locale-paths';
import { useLocale } from '~/lib/use-locale';
import type { Route } from '../../routes/+types/provider';

export function ProviderProfilePage({
  loaderData,
}: {
  loaderData: Route.ComponentProps['loaderData'];
}) {
  const { profile, listings, reviews, reviewSummary, reviewRating, reviewLimit, activeType } =
    loaderData;
  const locale = useLocale();
  const en = locale === 'en';
  const activeSince = new Intl.DateTimeFormat(en ? 'en-US' : 'vi-VN', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(profile.activeSince));
  return (
    <div className="min-h-screen bg-muted/30 pb-20 text-foreground">
      <div className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 py-6 xl:px-0">
        <SectionCard className="overflow-hidden p-0">
          <div className="h-24 bg-primary/10 sm:h-32" />
          <div className="px-5 pb-6 sm:px-8">
            <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Avatar className="size-24 border-4 border-card bg-card shadow-sm sm:size-28">
                  {profile.logoUrl ? (
                    <AvatarImage src={profile.logoUrl} alt={profile.name} />
                  ) : null}
                  <AvatarFallback className="text-2xl">{initials(profile.name)}</AvatarFallback>
                </Avatar>
                <div className="pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      {profile.name}
                    </h1>
                    {profile.identityVerified ? (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="size-3.5" />
                        {en ? 'Verified' : 'Đã xác minh'}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {en ? `Active since ${activeSince}` : `Hoạt động từ ${activeSince}`}
                  </p>
                </div>
              </div>
            </div>
            {profile.description ? (
              <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground">
                {profile.description}
              </p>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Stat
                icon={BriefcaseBusiness}
                value={profile.stats.publishedOfferings}
                label={en ? 'published services' : 'dịch vụ đang hoạt động'}
              />
              <Stat
                icon={CalendarCheck}
                value={profile.stats.completedBookings}
                label={en ? 'completed bookings' : 'lượt đặt hoàn tất'}
              />
              <Stat
                icon={Star}
                value={profile.stats.ratingAvg?.toFixed(1) ?? '—'}
                label={
                  en
                    ? `${profile.stats.reviewCount} reviews`
                    : `${profile.stats.reviewCount} đánh giá`
                }
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{en ? 'Services' : 'Dịch vụ'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {en
                  ? 'Published offerings from this provider'
                  : 'Các bài đăng đang được công khai của nhà cung cấp'}
              </p>
            </div>
            <nav
              className="flex flex-wrap gap-2"
              aria-label={en ? 'Service categories' : 'Danh mục dịch vụ'}
            >
              {profile.listingTypes.map((type) => (
                <Link
                  key={type.id}
                  to={`${storefrontPaths.provider(locale, profile.slug)}?type=${encodeURIComponent(type.slug)}`}
                  className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors ${activeType === type.slug ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/40'}`}
                >
                  {type.name} <span className="ml-1.5 opacity-70">{type.publishedCount}</span>
                </Link>
              ))}
            </nav>
          </div>
          {listings.length ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <>
                {listings.map((listing) => (
                  <ListingCard key={`${listing.kind}:${listing.id}`} listing={listing} />
                ))}
              </>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              {en
                ? 'No published services in this category.'
                : 'Chưa có dịch vụ công khai trong danh mục này.'}
            </div>
          )}
        </SectionCard>
        <PublicReviewsSection
          reviews={reviews}
          summary={reviewSummary}
          locale={locale}
          selectedRating={reviewRating}
          visibleLimit={reviewLimit}
        />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Star;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 p-4">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'BK'
  );
}
