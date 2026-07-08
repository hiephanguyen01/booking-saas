import { useOutletContext } from 'react-router';
import type { StorefrontTenant } from '../lib/tenant.server';
import { StudioHero } from '../templates/studio/hero';

export default function Home() {
  const tenant = useOutletContext<StorefrontTenant>();
  return <StudioHero tenant={tenant} />;
}
