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
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { cn } from '@booking/ui/lib/utils';
import { CircleAlert } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { PANEL_SURFACE } from '~/constants/surfaces';
import {
  DISPUTE_EVIDENCE_MAX,
  DISPUTE_REASON_MAX,
  bookingActionErrorKey,
} from '~/features/account/lib/booking-dispute';
import { useDisputeDialogController } from '~/features/account/hooks/use-dispute-dialog-controller';

export function DisputeBookingDialog({
  deadlineLabel,
  open,
  action,
  onOpenChange,
}: {
  deadlineLabel: string | null;
  open: boolean;
  /**
   * Where to post. Omit on the booking detail route, which owns the `dispute`
   * intent; the history list must pass that route's path explicitly.
   */
  action?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const {
    changeOpen,
    evidence,
    fetcher,
    handleSubmit,
    reason,
    reasonValid,
    serverError,
    setEvidence,
    setReason,
    submitting,
    trimmedReason,
  } = useDisputeDialogController({ open, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {/* The radius, border and shadow come from the tenant's surface config
          (`--sf-surface-*`), so the modal matches the panels behind it instead
          of hardcoding a square, borderless sheet. */}
      <DialogContent
        className={cn(
          PANEL_SURFACE,
          'max-h-[calc(100vh-2rem)] overflow-y-auto p-6 sm:max-w-[562px] sm:p-8',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-foreground">
            {t('bookings.disputeDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-muted-foreground">
            {t('bookings.disputeDialog.description')}
          </DialogDescription>
        </DialogHeader>

        {deadlineLabel ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {t('bookings.disputeDeadline', { date: deadlineLabel })}
          </p>
        ) : null}

        <Alert className="rounded-lg border-0 bg-warning/15 px-4 py-3 text-warning">
          <CircleAlert />
          <AlertDescription className="text-sm leading-5 text-warning">
            {t('bookings.disputeDialog.warning')}
          </AlertDescription>
        </Alert>

        <fetcher.Form method="post" action={action} className="space-y-5" onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value="dispute" />

          <div className="space-y-2">
            <Label htmlFor="dispute-reason" className="text-sm font-medium text-foreground">
              {t('bookings.disputeDialog.reasonLabel')}
            </Label>
            <Textarea
              id="dispute-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              maxLength={DISPUTE_REASON_MAX}
              disabled={submitting}
              required
              placeholder={t('bookings.disputeDialog.reasonPlaceholder')}
              aria-invalid={trimmedReason.length > 0 && !reasonValid}
              aria-describedby="dispute-reason-hint"
              className="min-h-28 rounded-sm border-primary/40 text-sm"
            />
            <p id="dispute-reason-hint" className="text-xs text-muted-foreground">
              {t('bookings.disputeDialog.reasonHint')} {reason.length}/{DISPUTE_REASON_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dispute-evidence" className="text-sm font-medium text-foreground">
              {t('bookings.disputeDialog.evidenceLabel')}
            </Label>
            <Textarea
              id="dispute-evidence"
              name="evidence"
              value={evidence}
              onChange={(event) => setEvidence(event.currentTarget.value)}
              maxLength={DISPUTE_EVIDENCE_MAX}
              disabled={submitting}
              placeholder={t('bookings.disputeDialog.evidencePlaceholder')}
              aria-describedby="dispute-evidence-hint"
              className="min-h-20 rounded-sm border-primary/40 text-sm"
            />
            <p id="dispute-evidence-hint" className="text-xs text-muted-foreground">
              {t('bookings.disputeDialog.evidenceHint')}
            </p>
          </div>

          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {t(bookingActionErrorKey(serverError))}
            </p>
          ) : null}

          <DialogFooter className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-sm border-foreground text-foreground"
                disabled={submitting}
              >
                {t('bookings.disputeDialog.back')}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="h-12 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!reasonValid || submitting}
            >
              {submitting
                ? t('bookings.disputeDialog.submitting')
                : t('bookings.disputeDialog.confirm')}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
