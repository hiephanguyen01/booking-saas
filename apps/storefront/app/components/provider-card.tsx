import { NsI18n, useTranslation } from '@booking/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { Check, Store, ShieldCheck } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { SectionCard } from '~/components/section-card';
import { storefrontPaths } from '~/constants/paths';
import type { RoomTrust } from '~/features/listing-group/lib/listing-group-types';
import { useLocale } from '~/hooks/use-locale';
import { nameInitials } from '~/lib/ui';
import { cn } from '@booking/ui/lib/utils';

/**
 * The partner behind the group's rooms.
 *
 * The subtitle used to read "{n} đã đặt", falling back to a hardcoded 456 when
 * the partner had no completed bookings — so most studios advertised the same
 * invented number. Only `trust.completedBookings` is real, and it already has a
 * row below, so the subtitle is gone.
 */
export function ProviderCard({
  trust,
  compactMobile = false,
}: {
  trust: RoomTrust | null;
  compactMobile?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const titleId = useId();
  const partnerName = trust?.partnerName || t('group.partnerFallback');

  return (
    <SectionCard
      aria-labelledby={titleId}
      className={cn(compactMobile && 'max-md:rounded-none max-md:border-x-0')}
    >
      <div className="flex items-center gap-3">
        <Avatar className={cn('size-11', compactMobile && 'max-md:size-10')}>
          {trust?.partnerLogoUrl ? <AvatarImage src={trust.partnerLogoUrl} alt="" /> : null}
          <AvatarFallback>{nameInitials(partnerName, 'ST')}</AvatarFallback>
        </Avatar>
        <div className={cn('min-w-0', compactMobile && 'flex-1')}>
          <h2
            id={titleId}
            className={cn('truncate text-base font-semibold', compactMobile && 'max-md:text-sm')}
          >
            {partnerName}
          </h2>
          {compactMobile && trust?.completedBookings ? (
            <p className="mt-1 text-xs text-muted-foreground md:hidden">
              {t('completedBookings', { count: trust.completedBookings })}
            </p>
          ) : null}
        </div>
        {compactMobile ? (
          <Button
            asChild
            size="control"
            variant="outline"
            className="h-10 shrink-0 px-3 text-xs md:hidden"
          >
            <Link to={storefrontPaths.provider(locale, trust?.partnerSlug ?? '')}>
              <Store /> {t('group.viewProvider')}
            </Link>
          </Button>
        ) : null}
      </div>
      <div className={cn('mt-4 flex flex-col gap-2 text-sm', compactMobile && 'max-md:hidden')}>
        {trust?.identityVerified ? (
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            {t('identityVerified')}
          </span>
        ) : null}
        {trust?.completedBookings ? (
          <span className="flex items-center gap-2">
            <Check className="size-4 text-primary" aria-hidden="true" />
            {t('completedBookings', { count: trust.completedBookings })}
          </span>
        ) : null}
      </div>
      <Button
        asChild
        size="control"
        variant="outline"
        className={cn('mt-5 w-full', compactMobile && 'max-md:hidden')}
      >
        <Link to={storefrontPaths.provider(locale, trust?.partnerSlug ?? '')}>
          <Store /> {t('group.viewProvider')}
        </Link>
      </Button>
    </SectionCard>
  );
}
