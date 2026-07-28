import { readStorefrontReadiness } from '~/lib/readiness.server';

export async function loader() {
  return readStorefrontReadiness();
}
