import { type Locale } from '@booking/i18n';
import { localeTranslator } from '~/lib/translator';
import type { loadProviderRoute } from '~/features/provider/server/provider-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

type ProviderProfile = ServerDataFrom<typeof loadProviderRoute>['profile'];

export function buildProviderMeta(profile: ProviderProfile | undefined, locale: Locale) {
  const { t } = localeTranslator(locale);
  if (!profile) return [{ title: t('catalog.provider.metaTitle') }];

  return [
    { title: profile.name },
    {
      name: 'description',
      content:
        profile.description ??
        t('catalog.provider.metaDescriptionFallback', { name: profile.name }),
    },
    { property: 'og:title', content: profile.name },
    { property: 'og:type', content: 'profile' },
    ...(profile.logoUrl ? [{ property: 'og:image', content: profile.logoUrl }] : []),
  ];
}
