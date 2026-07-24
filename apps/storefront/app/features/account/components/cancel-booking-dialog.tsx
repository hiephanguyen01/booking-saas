import type { Locale } from '@booking/i18n';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { CircleAlert } from 'lucide-react';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { AccountBookingViewModel } from '../lib/booking-history';
import { CancellationPolicyList } from './account-primitives';
import { useCancelBookingDialogController } from './use-cancel-booking-dialog-controller';

const REASON_KEYS = [
  'schedule',
  'listing',
  'promotion',
  'cheaper',
  'changedMind',
  'other',
] as const;

export function CancelBookingDialog({
  booking,
  locale,
  open,
  action,
  onOpenChange,
}: {
  booking: Pick<
    AccountBookingViewModel,
    'code' | 'startUtc' | 'depositAmount' | 'cancellationTiers'
  >;
  locale: Locale;
  open: boolean;
  action?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const {
    fetcher,
    selected,
    setSelected,
    otherReason,
    setOtherReason,
    reason,
    submitting,
    serverError,
    changeOpen,
  } = useCancelBookingDialogController({ bookingCode: booking.code, open, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-0 p-6 shadow-2xl sm:max-w-[562px] sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-[#202a3a]">
            {t('bookings.cancelDialog.title')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('bookings.cancelDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 text-sm leading-6">
          <CancellationPolicyList booking={booking} locale={locale} />
        </div>

        <Alert className="rounded-lg border-0 bg-[#fff2bd] px-4 py-3 text-[#ef8b00]">
          <CircleAlert />
          <AlertDescription className="text-sm leading-5 text-[#ef8b00]">
            {t('bookings.cancelDialog.warning')}
          </AlertDescription>
        </Alert>

        <fetcher.Form method="post" action={action} className="space-y-5">
          <input type="hidden" name="intent" value="cancel" />
          <input type="hidden" name="bookingCode" value={booking.code} />
          <input type="hidden" name="reason" value={reason} />
          <RadioGroup value={selected} onValueChange={setSelected} className="gap-4">
            {REASON_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-[#263247]"
              >
                <RadioGroupItem
                  value={key}
                  className="mt-0.5 border-[#526078] text-[#ff3f44] data-[state=checked]:border-[#ff3f44]"
                />
                <span className="pt-px">{t(`bookings.cancelDialog.reasons.${key}`)}</span>
              </label>
            ))}
          </RadioGroup>

          {selected === 'other' ? (
            <div>
              <Textarea
                value={otherReason}
                onChange={(event) => setOtherReason(event.currentTarget.value)}
                maxLength={500}
                placeholder={t('bookings.cancelDialog.otherPlaceholder')}
                aria-invalid={selected === 'other' && otherReason.trim().length === 0}
                className="min-h-11 rounded-sm border-[#ff8e91] text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">{otherReason.length}/500</p>
            </div>
          ) : null}

          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {t('bookings.actionFailed')}
            </p>
          ) : null}

          <DialogFooter className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-sm border-[#263247] text-[#263247]"
                disabled={submitting}
              >
                {t('bookings.cancelDialog.back')}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="h-12 rounded-sm bg-[#ff3f44] text-white hover:bg-[#e93439]"
              disabled={!reason || submitting}
            >
              {submitting
                ? t('bookings.cancelDialog.submitting')
                : t('bookings.cancelDialog.confirm')}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
