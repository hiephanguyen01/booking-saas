import { data } from 'react-router';
import type { Route } from './+types/legal';
import { localeParam } from '~/constants/paths';
import { LegalDocumentPage } from '~/features/legal/components/legal-document-page';
import { loadLegalDocumentRoute } from '~/features/legal/server/legal.server';

/**
 * Read by `use-storefront-app-shell-controller.ts`: legal pages render even
 * when `tenant.live` is false (a tenant that withdraws one document must not
 * hide the other three, including ones people already agreed to). The request
 * itself is exempted from the harder 423 gate in `request-security.server.ts`.
 */
export const handle = { bypassTenantGate: true };

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  const result = await loadLegalDocumentRoute(request, locale, params.docSlug, params['*']);
  return data(result, { headers: { 'Content-Language': result.document.servedLocale } });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return loaderData
    ? [{ title: loaderData.document.title }, { name: 'robots', content: 'noindex' }]
    : [];
}

export default function LegalRoute({ loaderData }: Route.ComponentProps) {
  return <LegalDocumentPage document={loaderData.document} isHistorical={loaderData.isHistorical} />;
}
