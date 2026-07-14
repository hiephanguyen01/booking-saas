import type { TranslationShape } from '../translation-shape';
import type { viNavigation } from '../vi/navigation';

export const enNavigation = {
  all: 'All',
  lookup: 'Find a booking',
  myBookings: 'My bookings',
  community: 'Community',
  becomePartner: 'Become a partner',
  login: 'Log in',
  register: 'Sign up',
  openMenu: 'Open menu',
} satisfies TranslationShape<typeof viNavigation>;
