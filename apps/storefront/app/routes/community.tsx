import { localeParam } from '~/constants/paths';
import { CommunityPage } from '~/features/community/components/community-page';
import { buildCommunityMeta } from '~/features/community/lib/community-meta';
import type { Route } from './+types/community';

export function meta({ params }: Route.MetaArgs) {
  return buildCommunityMeta(localeParam(params.locale));
}

export default CommunityPage;
