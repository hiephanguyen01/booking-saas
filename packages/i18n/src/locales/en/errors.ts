import type { TranslationShape } from '../translation-shape';
import type { viErrors } from '../vi/errors';

export const enErrors = {
  pageNotFound: 'Page not found',
  unknownHostTitle: 'Storefront not found',
  unknownHostDescription:
    'This domain is not connected to a storefront. Please check the address and try again.',
  generic: 'Something went wrong.',
  home: 'Back to Home',
  tenantSuspendedTitle: '{tenant} is temporarily unavailable',
  tenantSuspendedDescription:
    'This booking site is currently unavailable. Please contact the store owner for details.',
  tenantUnavailable: 'This storefront is currently unavailable. Please try again later.',
  invalidProvinceCode: 'That province code is not valid.',
  api: {
    timeout: 'The request timed out. Please try again.',
    network: 'The service is temporarily unavailable. Please try again.',
    invalidResponse: 'The service returned an invalid response. Please try again.',
    generic: 'Unable to complete the request. Please try again.',
  },
} satisfies TranslationShape<typeof viErrors>;
