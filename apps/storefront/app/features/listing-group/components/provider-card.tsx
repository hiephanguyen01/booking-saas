import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { Check, MessageCircle, ShieldCheck } from 'lucide-react';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { RoomTrust } from '../listing-group-types';

/**
 * The partner behind the group's rooms.
 *
 * The subtitle used to read "{n} đã đặt", falling back to a hardcoded 456 when
 * the partner had no completed bookings — so most studios advertised the same
 * invented number. Only `trust.completedBookings` is real, and it already has a
 * row below, so the subtitle is gone.
 */
export function ProviderCard({ trust }: { trust: RoomTrust | null }) {
  const { t } = useTranslation(NsI18n.Listing);
  const partnerName = trust?.partnerName || t('group.partnerFallback');
  return (
    <div className="rounded-lg bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar className="size-11">
          <AvatarFallback>{initials(partnerName)}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 truncate font-semibold">{partnerName}</p>
      </div>
      <div className="mt-4 flex flex-col gap-2 text-sm">
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
        type="button"
        variant="outline"
        className="mt-5 w-full"
        disabled
        title={t('group.viewProviderComingSoon')}
      >
        <MessageCircle /> {t('group.viewProvider')}
      </Button>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'ST'
  );
}
