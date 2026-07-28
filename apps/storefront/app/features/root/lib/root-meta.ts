import type { RootLoaderPayload } from '~/features/root/server/root-loader.server';

export function buildRootMeta(loaderData: RootLoaderPayload | undefined) {
  if (!loaderData) return [{ title: 'BookingOS' }];

  if (loaderData.kind === 'platform') {
    return [
      { title: loaderData.seo.title },
      { name: 'description', content: loaderData.seo.description },
      { property: 'og:title', content: loaderData.seo.title },
      { property: 'og:description', content: loaderData.seo.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'BookingOS' },
      { property: 'og:url', content: loaderData.canonical },
      { tagName: 'link', rel: 'canonical', href: loaderData.canonical },
      { tagName: 'link', rel: 'alternate', hrefLang: 'vi', href: loaderData.alternates.vi },
      { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: loaderData.alternates.en },
      {
        tagName: 'link',
        rel: 'alternate',
        hrefLang: 'x-default',
        href: loaderData.alternates.default,
      },
    ];
  }

  const tenant = loaderData.tenant;

  const title = tenant.themeConfig.seo?.title || tenant.name;
  const description = tenant.themeConfig.seo?.description || undefined;
  const tags: Array<Record<string, string>> = [
    { title },
    { property: 'og:title', content: title },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: tenant.name },
    { property: 'og:url', content: loaderData.canonical },
    { tagName: 'link', rel: 'canonical', href: loaderData.canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'vi', href: loaderData.alternates.vi },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: loaderData.alternates.en },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'x-default',
      href: loaderData.alternates.default,
    },
  ];

  if (description) {
    tags.push({ name: 'description', content: description });
    tags.push({ property: 'og:description', content: description });
  }
  if (tenant.themeConfig.hero?.imageUrl) {
    tags.push({ property: 'og:image', content: tenant.themeConfig.hero.imageUrl });
  }
  return tags;
}
