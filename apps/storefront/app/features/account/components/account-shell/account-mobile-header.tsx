import { NsI18n, useTranslation, type Locale } from '@booking/i18n';
import { useLocation } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { MobileFlowHeader } from '~/features/site-shell/components/mobile-flow-header';

type AccountMobilePage =
  | 'overview'
  | 'profile'
  | 'bookings'
  | 'booking-detail'
  | 'messages'
  | 'reviews'
  | 'favorites'
  | 'recent'
  | 'terms'
  | 'security'
  | 'help';

function accountMobilePage(pathname: string): AccountMobilePage {
  const segments = pathname.split('/').filter(Boolean);
  const accountIndex = segments.indexOf('account');
  const page = segments[accountIndex + 1];

  if (page === 'bookings' && segments[accountIndex + 2]) return 'booking-detail';
  if (
    page === 'profile' ||
    page === 'bookings' ||
    page === 'messages' ||
    page === 'reviews' ||
    page === 'favorites' ||
    page === 'recent' ||
    page === 'terms' ||
    page === 'security' ||
    page === 'help'
  ) {
    return page;
  }
  return 'overview';
}

/** One mobile app bar for every page nested under the account layout. */
export function AccountMobileHeader({ locale }: { locale: Locale }) {
  const { pathname } = useLocation();
  const { t } = useTranslation([NsI18n.Account, NsI18n.Booking]);
  const page = accountMobilePage(pathname);
  const isBookingDetail = page === 'booking-detail';
  const title = (() => {
    switch (page) {
      case 'profile':
        return t('account:profile.title');
      case 'bookings':
        return t('account:bookings.title');
      case 'booking-detail':
        return t('account:bookings.detailTitle');
      case 'messages':
        return t('account:messages.title');
      case 'reviews':
        return t('account:reviews.title');
      case 'favorites':
        return t('account:favorites.title');
      case 'recent':
        return t('account:recent.title');
      case 'terms':
        return t('account:nav.terms');
      case 'security':
        return t('account:nav.security');
      case 'help':
        return t('account:help.title');
      case 'overview':
        return t('account:overview.title');
    }
  })();
  const backHref = isBookingDetail
    ? storefrontPaths.account.bookings(locale)
    : page !== 'overview' && page !== 'bookings'
      ? storefrontPaths.account.overview(locale)
      : undefined;

  return (
    <MobileFlowHeader
      title={title}
      backHref={backHref}
      backLabel={
        isBookingDetail ? t('booking:mobile.back') : t('account:bookings.mobile.back')
      }
      chatHref={isBookingDetail ? storefrontPaths.account.messages(locale) : undefined}
      chatLabel={isBookingDetail ? t('account:bookings.chat') : undefined}
    />
  );
}
