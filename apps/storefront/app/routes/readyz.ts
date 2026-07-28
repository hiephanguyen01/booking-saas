import { readStorefrontReadiness } from '~/features/root/server/readiness.server';

export async function loader() {
  return readStorefrontReadiness();
}
