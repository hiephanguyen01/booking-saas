import type { TranslationShape } from '../translation-shape';
import type { viNavigation } from '../vi/navigation';

export const enNavigation = {
  mainNavigation: 'Main navigation',
  brandHome: '{tenant} - Home',
  categories: 'Categories',
  all: 'All',
  lookup: 'Find a booking',
  community: 'Community',
  myBookings: 'My bookings',
  becomePartner: 'Become a partner',
  login: 'Log in',
  register: 'Sign up',
  openMenu: 'Open menu',
  logout: 'Log out',
  accountMenu: 'Open account menu',
  switchLanguage: 'Switch language to {locale}',
} satisfies TranslationShape<typeof viNavigation>;
