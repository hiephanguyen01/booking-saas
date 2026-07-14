import { Link, useOutletContext } from 'react-router';
import { ArrowRight, MapPin } from 'lucide-react';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import type { Route } from './+types/listing-group';
import { fetchListingGroup } from '../lib/catalog.server';
import { storefrontPaths } from '../lib/locale-paths';
import { formatVnd } from '../lib/ui';
import type { StorefrontContext } from '../root';
import { jsonLd } from '../lib/seo';

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const group = loaderData?.group;
  if (!group) return [{ title: 'Bài đăng' }];
  const description = group.description?.slice(0, 180) ?? group.title;
  const tags: Route.MetaDescriptors = [
    { title: group.title },
    { name: 'description', content: description },
    { property: 'og:title', content: group.title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
  ];
  if (group.photos[0]) tags.push({ property: 'og:image', content: group.photos[0] });
  return tags;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const group = await fetchListingGroup(request, params.groupSlug);
  if (!group) throw new Response('Listing group not found', { status: 404 });
  return { group };
}

export default function ListingGroupRoute({ loaderData, params }: Route.ComponentProps) {
  const { group } = loaderData;
  const { tenant, canonical } = useOutletContext<StorefrontContext>();
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const location = group.address || group.workingArea;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${new URL(canonical).origin}/#organization`, name: tenant.name, url: new URL(canonical).origin },
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: group.title,
        description: group.description,
        image: group.photos,
        hasPart: group.listings.map((listing) => ({ '@type': 'Service', name: listing.title, url: new URL(storefrontPaths.listing(locale, listing.slug), canonical).toString() })),
      },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: locale === 'vi' ? 'Trang chủ' : 'Home', item: new URL(`/${locale}`, canonical).toString() }, { '@type': 'ListItem', position: 2, name: group.title, item: canonical }] },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} /><main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-8"><header className="flex flex-col gap-3"><h1 className="text-3xl font-bold tracking-tight">{group.title}</h1>{location ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4" /> {location}</p> : null}</header><Gallery photos={group.photos} title={group.title} /><div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="flex flex-col gap-6">{group.description ? <p className="whitespace-pre-wrap leading-relaxed">{group.description}</p> : null}{group.amenities.length ? <div className="flex flex-wrap gap-2">{group.amenities.map((amenity) => <Badge key={amenity} variant="secondary">{amenity}</Badge>)}</div> : null}</section><aside><Card><CardHeader><CardTitle>{group.listings.length} {group.itemLabel}</CardTitle><CardDescription>Chọn một {group.itemLabel} để xem lịch và đặt.</CardDescription></CardHeader></Card></aside></div><section className="flex flex-col gap-5"><div><h2 className="text-2xl font-semibold capitalize">{group.itemLabel}</h2><p className="text-sm text-muted-foreground">Các lựa chọn có thể đặt trong bài đăng này.</p></div><div className="grid gap-5 md:grid-cols-2">{group.listings.map((listing) => <Card key={listing.id}><CardHeader>{listing.photos[0] ? <img src={listing.photos[0]} alt="" className="mb-3 aspect-[3/2] w-full rounded-md object-cover" /> : null}<CardTitle>{listing.title}</CardTitle><CardDescription>{listing.bookingModes.join(' · ')}</CardDescription></CardHeader><CardContent><p className="line-clamp-3 text-sm text-muted-foreground">{listing.description || 'Xem chi tiết và lịch khả dụng.'}</p></CardContent><CardFooter className="justify-between"><span className="font-medium">{listing.priceFrom ? `Từ ${formatVnd(listing.priceFrom)}` : 'Liên hệ'}</span><Button asChild><Link to={storefrontPaths.listing(locale, listing.slug)}>Xem lịch & đặt {group.itemLabel}<ArrowRight data-icon="inline-end" /></Link></Button></CardFooter></Card>)}</div></section></main></>;
}

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  if (!photos.length) return <div className="flex aspect-[16/7] items-center justify-center rounded-2xl bg-muted text-muted-foreground">{title}</div>;
  return <div className="grid gap-2 overflow-hidden rounded-2xl md:h-[420px] md:grid-cols-4 md:grid-rows-2"><img src={photos[0]} alt={title} className="h-full w-full object-cover md:col-span-2 md:row-span-2" />{photos.slice(1, 5).map((photo) => <img key={photo} src={photo} alt="" className="hidden h-full w-full object-cover md:block" />)}</div>;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) { const locale = params.locale === 'en' ? 'en' : 'vi'; return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel="Về trang chủ" />; }
