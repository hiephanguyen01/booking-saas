import { CommunityPage } from '~/features/community/components/community-page';
import { buildCommunityMeta } from '~/features/community/lib/community-meta';
import type { Route } from './+types/community';

export function meta({ params }: Route.MetaArgs) {
  return buildCommunityMeta(params.locale === 'en' ? 'en' : 'vi');
}

export default CommunityPage;
